import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import AdmZip from 'adm-zip';
import OpenAI from 'openai';
import sharp from 'sharp';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: path.join(__dirname, 'data', 'tmp') });
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = Number(process.env.PORT || 3000);
const ANSWER_MODEL = process.env.ANSWER_MODEL || 'gpt-5.4-mini';
const VISION_MODEL = process.env.VISION_MODEL || 'gpt-5.4-mini';
const DATA_DIR = path.join(__dirname, 'data');
const MANUALS_DIR = path.join(DATA_DIR, 'manuals');
const ANNOTATED_DIR = path.join(DATA_DIR, 'annotated');
const MANIFEST_PATH = path.join(DATA_DIR, 'manuals.json');

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(DATA_DIR));

await fsp.mkdir(MANUALS_DIR, { recursive: true });
await fsp.mkdir(ANNOTATED_DIR, { recursive: true });
await fsp.mkdir(path.join(DATA_DIR, 'tmp'), { recursive: true });

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function loadManifests() {
  return readJsonFile(MANIFEST_PATH, {});
}

async function saveManifest(manualId, manifest) {
  const all = await loadManifests();
  all[manualId] = manifest;
  await writeJsonFile(MANIFEST_PATH, all);
}

function makeId(prefix = 'manual') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function walkFiles(rootDir) {
  const out = [];
  function walk(current) {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else out.push(full);
    }
  }
  walk(rootDir);
  return out;
}

function findBestManualTextFile(files) {
  const candidates = files.filter(f => /\.(md|txt|json|csv)$/i.test(f));
  const preferred = candidates.find(f => /manual.*(image|reference|with|user)|user.*manual/i.test(path.basename(f)));
  return preferred || candidates.find(f => /\.md$/i.test(f)) || candidates.find(f => /\.txt$/i.test(f)) || candidates[0];
}

function findIndexFile(files) {
  // Prefer the enhanced index because it contains task/keyword descriptions.
  return files.find(f => /screenshot[_-]?index[_-]?enhanced\.json$/i.test(path.basename(f))) ||
    files.find(f => /screenshot[_-]?index[_-]?enhanced\.csv$/i.test(path.basename(f))) ||
    files.find(f => /screenshot[_-]?index\.json$/i.test(path.basename(f))) ||
    files.find(f => /screenshot[_-]?index\.csv$/i.test(path.basename(f)));
}

function findTaskMapFile(files) {
  return files.find(f => /task[_-]?screenshot[_-]?map\.json$/i.test(path.basename(f))) ||
    files.find(f => /task[_-]?screenshot[_-]?map\.csv$/i.test(path.basename(f)));
}

function parseCsvSimple(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = values[i] || '');
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function loadScreenshotIndex(indexPath, imageFiles) {
  if (!indexPath) return imageFiles.map((f, i) => ({ screenshot_id: `screenshot_${i + 1}`, file: path.basename(f), caption: path.basename(f) }));

  const raw = await fsp.readFile(indexPath, 'utf8');
  let entries;
  if (/\.json$/i.test(indexPath)) {
    const json = JSON.parse(raw);
    entries = Array.isArray(json) ? json : (json.screenshots || json.items || Object.values(json));
  } else {
    entries = parseCsvSimple(raw);
  }
  return entries.map((e, i) => normalizeIndexEntry(e, i, imageFiles)).filter(Boolean);
}

async function loadTaskScreenshotMap(taskMapPath) {
  if (!taskMapPath) return [];
  const raw = await fsp.readFile(taskMapPath, 'utf8');
  let entries;
  if (/\.json$/i.test(taskMapPath)) {
    const json = JSON.parse(raw);
    entries = Array.isArray(json) ? json : (json.tasks || json.items || Object.values(json));
  } else {
    entries = parseCsvSimple(raw);
  }
  return entries.map(e => ({
    task: String(e.task || e.intent || e.query || '').toLowerCase(),
    preferred_screenshot: String(e.preferred_screenshot || e.screenshot_file || e.file || ''),
    alternate_screenshots: String(e.alternate_screenshots || ''),
    target_hint: String(e.target_hint || e.description || e.notes || '')
  })).filter(e => e.task && e.preferred_screenshot);
}

function taskScore(question, task) {
  const qTokens = new Set(tokenize(question));
  const tTokens = tokenize(task);
  let score = 0;
  for (const t of tTokens) {
    if (qTokens.has(t)) score += 1;
  }
  if (question.toLowerCase().includes(task)) score += 20;
  return score;
}

function findTaskOverride(question, taskMap, screenshotIndex) {
  const q = String(question || '').toLowerCase();

  // Critical deterministic override for the known multi-image rental-order line-item screen.
  if (
    /\bline\s*items?\b/.test(q) ||
    /\badd\s+(equipment|asset|item)\b/.test(q) ||
    /\badd\s+.*\b(rental\s+order|quote)\b/.test(q)
  ) {
    const targetFile = 'p14_01_rental_order_quote_detail_page_2.png';
    const match = screenshotIndex.find(s => path.basename(s.file) === targetFile);
    if (match) {
      return {
        ...match,
        score: 999,
        overrideReason: 'Hard override: line-item questions should use Rental Order / Quote Detail Page (2).'
      };
    }
  }

  // Otherwise use the uploaded task_screenshot_map if present.
  let best = null;
  for (const row of taskMap || []) {
    const score = taskScore(q, row.task);
    if (!best || score > best.score) best = { ...row, score };
  }

  if (best && best.score >= 2) {
    const preferredBase = path.basename(best.preferred_screenshot);
    const match = screenshotIndex.find(s => path.basename(s.file) === preferredBase);
    if (match) {
      return {
        ...match,
        score: 900 + best.score,
        overrideReason: `Task map match: ${best.task}`,
        target_hint: best.target_hint
      };
    }
  }

  return null;
}

function normalizeIndexEntry(entry, i, imageFiles) {
  const fileKeys = ['screenshot_file', 'screenshot_filename', 'image_file', 'image_filename', 'filename', 'file', 'path', 'image_path'];
  let file = '';
  for (const key of fileKeys) {
    if (entry[key]) {
      file = String(entry[key]);
      break;
    }
  }
  const basename = file ? path.basename(file) : '';
  const matched = basename ? imageFiles.find(f => path.basename(f) === basename) : imageFiles[i];
  if (!matched) return null;

  return {
    screenshot_id: String(entry.screenshot_id || entry.id || path.parse(matched).name || `screenshot_${i + 1}`),
    file: path.basename(matched),
    caption: String(entry.caption || entry.description || entry.title || entry.screen || entry.screen_name || path.basename(matched)),
    page: entry.page || entry.page_number || '',
    feature: String(entry.feature || entry.section || ''),
    screen: String(entry.screen || entry.screen_name || ''),
    description: String(entry.description || ''),
    visible_section: String(entry.visible_section || ''),
    related_tasks: String(entry.related_tasks || ''),
    keywords: String(entry.keywords || ''),
    notes: String(entry.notes || ''),
    raw: entry
  };
}

function buildImageMap(imageFiles) {
  const map = {};
  for (const full of imageFiles) map[path.basename(full)] = full;
  return map;
}

function tokenize(s) {
  return String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

function scoreCandidate(question, candidate) {
  const q = new Set(tokenize(question));
  const text = `${candidate.caption} ${candidate.feature} ${candidate.screen} ${candidate.description || ''} ${candidate.visible_section || ''} ${candidate.related_tasks || ''} ${candidate.keywords || ''} ${candidate.notes || ''} ${candidate.file}`;
  let score = 0;
  for (const t of tokenize(text)) if (q.has(t)) score += 1;
  if (/rental order/i.test(question) && /rental.*order/i.test(text)) score += 4;
  if (/quote/i.test(question) && /quote/i.test(text)) score += 4;
  if (/asset|equipment/i.test(question) && /asset|equipment/i.test(text)) score += 4;
  if (/work order/i.test(question) && /work.*order/i.test(text)) score += 4;
  if (/customer/i.test(question) && /customer/i.test(text)) score += 4;
  if (/login|sign in/i.test(question) && /login|sign/i.test(text)) score += 4;
  return score;
}

function topScreenshotCandidates(question, index, taskMap = [], n = 8) {
  const override = findTaskOverride(question, taskMap, index);

  let ranked = [...index]
    .map(c => ({ ...c, score: scoreCandidate(question, c) }))
    .sort((a, b) => b.score - a.score);

  if (override) {
    ranked = [
      override,
      ...ranked.filter(c => path.basename(c.file) !== path.basename(override.file))
    ];
  }

  return ranked
    .slice(0, n)
    .map(c => ({
      screenshot_id: c.screenshot_id,
      file: c.file,
      caption: c.caption,
      page: c.page,
      feature: c.feature,
      screen: c.screen,
      description: c.description || '',
      visible_section: c.visible_section || '',
      related_tasks: c.related_tasks || '',
      keywords: c.keywords || '',
      notes: c.notes || '',
      overrideReason: c.overrideReason || '',
      target_hint: c.target_hint || '',
      score: c.score
    }));
}

function safeJsonFromText(text) {
  const trimmed = String(text || '').trim();
  try { return JSON.parse(trimmed); } catch {}
  const match = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[1] || match[0]); } catch {}
  }
  return null;
}

async function uploadToOpenAIAndCreateVectorStore(manualName, searchableFiles) {
  const vectorStore = await client.vectorStores.create({ name: manualName });

  for (const filePath of searchableFiles) {
    const uploaded = await client.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'assistants'
    });
    await client.vectorStores.files.create(vectorStore.id, {
      file_id: uploaded.id,
      attributes: {
        kind: path.basename(filePath).toLowerCase().includes('screenshot') ? 'screenshot_index' : 'manual_text'
      }
    });
  }

  await waitForVectorStore(vectorStore.id);
  return vectorStore.id;
}

async function waitForVectorStore(vectorStoreId) {
  const timeoutMs = 120000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = await client.vectorStores.files.list(vectorStoreId, { limit: 100 });
    const statuses = list.data.map(f => f.status);
    if (statuses.length && statuses.every(s => s === 'completed')) return;
    if (statuses.some(s => s === 'failed')) throw new Error(`A vector-store file failed indexing: ${JSON.stringify(statuses)}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Vector store indexing timed out. Try again in a minute.');
}

async function generateGroundedAnswer({ question, vectorStoreId, candidates, includeScreenshots = true }) {
  const developerPrompt = `
You are an in-app support agent for Aiven Rental App.
Use the file_search tool to answer from the uploaded user manual and screenshot index.
Return only valid JSON with this exact shape:
{
  "answer_markdown": "short practical answer with numbered steps",
  "screenshot_file": "filename from candidates or null",
  "target_label": "specific UI element to circle, such as New RO button, or null",
  "visual_instruction": "one sentence explaining what the image should highlight, or null",
  "confidence": 0.0
}
Rules:
- Do not invent features or button labels.
- Choose screenshot_file only from the candidate list.
- If the first candidate has overrideReason, you MUST use that first candidate as screenshot_file unless it is clearly unrelated.
- For questions about adding/editing line items on rental orders, use the candidate whose file is p14_01_rental_order_quote_detail_page_2.png.
- If the user does not need a visual, set screenshot_file and target_label to null.
- If documentation is unclear, say that in answer_markdown.
`;

  const response = await client.responses.create({
    model: ANSWER_MODEL,
    input: [
      { role: 'developer', content: [{ type: 'input_text', text: developerPrompt }] },
      {
        role: 'user',
        content: [{
          type: 'input_text',
          text: `User question: ${question}\n\nincludeScreenshots: ${includeScreenshots}\n\nScreenshot candidates:\n${JSON.stringify(candidates, null, 2)}`
        }]
      }
    ],
    tools: [{
      type: 'file_search',
      vector_store_ids: [vectorStoreId],
      max_num_results: 6
    }],
    include: ['file_search_call.results']
  });

  const text = response.output_text || '';
  const json = safeJsonFromText(text);
  if (json && json.answer_markdown) return json;

  return {
    answer_markdown: text || 'I could not generate an answer from the documentation.',
    screenshot_file: null,
    target_label: null,
    visual_instruction: null,
    confidence: 0
  };
}

async function locateTargetWithVision(imagePath, targetLabel, instruction) {
  const meta = await sharp(imagePath).metadata();
  const data = await fsp.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase().replace('.', '') || 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = `data:${mime};base64,${data.toString('base64')}`;

  const prompt = `
Find the UI element to annotate in this screenshot.
Target label: ${targetLabel || 'most relevant UI element'}
Instruction: ${instruction || ''}
Image size: ${meta.width}x${meta.height} pixels.
Return only JSON:
{
  "found": true,
  "x": number,
  "y": number,
  "width": number,
  "height": number,
  "label": "short label"
}
Coordinates must be pixel coordinates in the original image. If exact target is unclear, return the best relevant region and set found=false.
`;

  const response = await client.responses.create({
    model: VISION_MODEL,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: dataUrl, detail: 'high' }
      ]
    }]
  });

  const json = safeJsonFromText(response.output_text || '');
  if (!json) return null;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));
  const x = clamp(json.x, 0, meta.width || 0);
  const y = clamp(json.y, 0, meta.height || 0);
  const width = clamp(json.width, 10, (meta.width || 0) - x);
  const height = clamp(json.height, 10, (meta.height || 0) - y);

  return {
    found: Boolean(json.found),
    x, y, width, height,
    label: String(json.label || targetLabel || 'Click here'),
    imageWidth: meta.width,
    imageHeight: meta.height
  };
}

async function annotateImage(imagePath, box, outputPath) {
  const meta = await sharp(imagePath).metadata();
  const w = meta.width || 1200;
  const h = meta.height || 800;
  const strokeWidth = Math.max(5, Math.round(Math.min(w, h) * 0.006));
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = Math.max(box.width / 2 + 12, 24);
  const ry = Math.max(box.height / 2 + 12, 24);
  const labelX = Math.max(10, Math.min(w - 220, box.x));
  const labelY = Math.max(24, box.y - 12);
  const escaped = String(box.label || 'Click here').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#ff3b30" stroke-width="${strokeWidth}"/>
    <rect x="${labelX}" y="${labelY - 24}" width="${Math.min(260, escaped.length * 9 + 30)}" height="28" rx="8" fill="#ff3b30"/>
    <text x="${labelX + 12}" y="${labelY - 5}" font-size="16" font-family="Arial, sans-serif" font-weight="700" fill="white">${escaped}</text>
  </svg>`;

  await sharp(imagePath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
}

app.get('/api/manuals', async (_req, res) => {
  const all = await loadManifests();
  res.json(Object.values(all).map(m => ({ manualId: m.manualId, name: m.name, createdAt: m.createdAt })));
});

app.post('/api/upload-manual', upload.single('manualZip'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing. Add it to .env first.');
    if (!req.file) throw new Error('Upload a ZIP file in the manualZip field.');

    const manualId = makeId('manual');
    const manualDir = path.join(MANUALS_DIR, manualId);
    await fsp.mkdir(manualDir, { recursive: true });

    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(manualDir, true);
    await fsp.unlink(req.file.path).catch(() => {});

    const files = walkFiles(manualDir);
    const imageFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    const manualTextFile = findBestManualTextFile(files);
    const indexFile = findIndexFile(files);
    const taskMapFile = findTaskMapFile(files);

    if (!manualTextFile) throw new Error('Could not find a .md, .txt, .json, or .csv manual file in the ZIP.');

    const screenshotIndex = await loadScreenshotIndex(indexFile, imageFiles);
    const taskMap = await loadTaskScreenshotMap(taskMapFile);
    const imageMap = buildImageMap(imageFiles);

    const normalizedIndexPath = path.join(manualDir, 'normalized_screenshot_index.json');
    const normalizedTaskMapPath = path.join(manualDir, 'normalized_task_screenshot_map.json');
    await writeJsonFile(normalizedIndexPath, screenshotIndex);
    await writeJsonFile(normalizedTaskMapPath, taskMap);

    const vectorStoreId = await uploadToOpenAIAndCreateVectorStore(`Aiven support ${manualId}`, [manualTextFile, normalizedIndexPath, normalizedTaskMapPath]);

    const manifest = {
      manualId,
      name: path.basename(req.file.originalname),
      createdAt: new Date().toISOString(),
      vectorStoreId,
      manualDir,
      manualTextFile,
      indexFile: normalizedIndexPath,
      taskMapFile: normalizedTaskMapPath,
      screenshotIndex,
      taskMap,
      imageMap
    };

    await saveManifest(manualId, manifest);
    res.json({ manualId, vectorStoreId, screenshotCount: screenshotIndex.length, message: 'Manual uploaded and indexed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { manualId, question, includeScreenshots = true } = req.body || {};
    if (!manualId || !question) throw new Error('manualId and question are required.');

    const all = await loadManifests();
    const manifest = all[manualId];
    if (!manifest) throw new Error('Manual not found. Upload a ZIP first.');

    const candidates = includeScreenshots
      ? topScreenshotCandidates(question, manifest.screenshotIndex, manifest.taskMap || [], 8)
      : [];

    const answer = await generateGroundedAnswer({
      question,
      vectorStoreId: manifest.vectorStoreId,
      candidates,
      includeScreenshots
    });

    let annotatedImageUrl = null;
    let originalImageUrl = null;
    let chosenScreenshot = null;

    if (includeScreenshots && answer.screenshot_file) {
      const chosenFile = path.basename(answer.screenshot_file);
      const imagePath = manifest.imageMap[chosenFile];
      if (imagePath && fs.existsSync(imagePath)) {
        chosenScreenshot = chosenFile;
        originalImageUrl = `/files/${path.relative(DATA_DIR, imagePath).split(path.sep).join('/')}`;

        const box = await locateTargetWithVision(imagePath, answer.target_label, answer.visual_instruction);
        if (box) {
          const outName = `${manualId}_${Date.now()}_${path.parse(chosenFile).name}.png`;
          const outPath = path.join(ANNOTATED_DIR, outName);
          await annotateImage(imagePath, box, outPath);
          annotatedImageUrl = `/files/annotated/${outName}`;
        }
      }
    }

    res.json({
      answer: answer.answer_markdown,
      chosenScreenshot,
      targetLabel: answer.target_label,
      annotatedImageUrl,
      originalImageUrl,
      confidence: answer.confidence,
      candidates,
      includeScreenshots
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Aiven support agent MVP running at http://localhost:${PORT}`);
});
