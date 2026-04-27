const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const OpenAI = require("openai");
const sharp = require("sharp");

const SUPPORT_AGENT_DATA_ROOT = path.join(__dirname, "..", "data", "support-agent");
const SUPPORT_AGENT_MANUALS_ROOT = path.join(SUPPORT_AGENT_DATA_ROOT, "manuals");
const SUPPORT_AGENT_ANNOTATED_ROOT = path.join(SUPPORT_AGENT_DATA_ROOT, "annotated");
const ANSWER_MODEL = String(process.env.SUPPORT_AGENT_ANSWER_MODEL || process.env.ANSWER_MODEL || "gpt-5.4-mini");
const VISION_MODEL = String(process.env.SUPPORT_AGENT_VISION_MODEL || process.env.VISION_MODEL || "gpt-5.4-mini");
const VECTOR_STORE_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.SUPPORT_AGENT_VECTOR_TIMEOUT_MS || 300_000) || 300_000
);

let openAiClient = null;

function getOpenAiClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing. Add it to .env first.");
  if (!openAiClient) openAiClient = new OpenAI({ apiKey });
  return openAiClient;
}

async function ensureSupportAgentDirs() {
  await fsp.mkdir(SUPPORT_AGENT_MANUALS_ROOT, { recursive: true });
  await fsp.mkdir(SUPPORT_AGENT_ANNOTATED_ROOT, { recursive: true });
}

function makeManualStorageName(id) {
  return `manual-${id}`;
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
  const candidates = files.filter((filePath) => /\.(md|txt|json|csv)$/i.test(filePath));
  const preferred = candidates.find((filePath) =>
    /manual.*(image|reference|with|user)|user.*manual/i.test(path.basename(filePath))
  );
  return (
    preferred ||
    candidates.find((filePath) => /\.md$/i.test(filePath)) ||
    candidates.find((filePath) => /\.txt$/i.test(filePath)) ||
    candidates[0] ||
    null
  );
}

function findIndexFile(files) {
  return (
    files.find((filePath) => /screenshot[_-]?index[_-]?enhanced\.json$/i.test(path.basename(filePath))) ||
    files.find((filePath) => /screenshot[_-]?index[_-]?enhanced\.csv$/i.test(path.basename(filePath))) ||
    files.find((filePath) => /screenshot[_-]?index\.json$/i.test(path.basename(filePath))) ||
    files.find((filePath) => /screenshot[_-]?index\.csv$/i.test(path.basename(filePath))) ||
    null
  );
}

function findTaskMapFile(files) {
  return (
    files.find((filePath) => /task[_-]?screenshot[_-]?map\.json$/i.test(path.basename(filePath))) ||
    files.find((filePath) => /task[_-]?screenshot[_-]?map\.csv$/i.test(path.basename(filePath))) ||
    null
  );
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

function parseCsvSimple(csv) {
  const lines = String(csv || "")
    .split(/\r?\n/)
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}

function normalizeIndexEntry(entry, index, imageFiles) {
  const fileKeys = [
    "screenshot_file",
    "screenshot_filename",
    "image_file",
    "image_filename",
    "filename",
    "file",
    "path",
    "image_path",
  ];
  let fileName = "";
  for (const key of fileKeys) {
    if (entry[key]) {
      fileName = String(entry[key]);
      break;
    }
  }
  const basename = fileName ? path.basename(fileName) : "";
  const matched = basename ? imageFiles.find((filePath) => path.basename(filePath) === basename) : imageFiles[index];
  if (!matched) return null;
  return {
    screenshot_id: String(entry.screenshot_id || entry.id || path.parse(matched).name || `screenshot_${index + 1}`),
    file: path.basename(matched),
    caption: String(entry.caption || entry.description || entry.title || entry.screen || entry.screen_name || path.basename(matched)),
    page: entry.page || entry.page_number || "",
    feature: String(entry.feature || entry.section || ""),
    screen: String(entry.screen || entry.screen_name || ""),
    description: String(entry.description || ""),
    visible_section: String(entry.visible_section || ""),
    related_tasks: String(entry.related_tasks || ""),
    keywords: String(entry.keywords || ""),
    notes: String(entry.notes || ""),
  };
}

async function loadScreenshotIndex(indexPath, imageFiles) {
  if (!indexPath) {
    return imageFiles.map((filePath, index) => ({
      screenshot_id: `screenshot_${index + 1}`,
      file: path.basename(filePath),
      caption: path.basename(filePath),
    }));
  }
  const raw = await fsp.readFile(indexPath, "utf8");
  let entries;
  if (/\.json$/i.test(indexPath)) {
    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed) ? parsed : parsed.screenshots || parsed.items || Object.values(parsed);
  } else {
    entries = parseCsvSimple(raw);
  }
  return entries.map((entry, index) => normalizeIndexEntry(entry, index, imageFiles)).filter(Boolean);
}

async function loadTaskScreenshotMap(taskMapPath) {
  if (!taskMapPath) return [];
  const raw = await fsp.readFile(taskMapPath, "utf8");
  let entries;
  if (/\.json$/i.test(taskMapPath)) {
    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed) ? parsed : parsed.tasks || parsed.items || Object.values(parsed);
  } else {
    entries = parseCsvSimple(raw);
  }
  return entries
    .map((entry) => ({
      task: String(entry.task || entry.intent || entry.query || "").toLowerCase(),
      preferred_screenshot: String(entry.preferred_screenshot || entry.screenshot_file || entry.file || ""),
      alternate_screenshots: String(entry.alternate_screenshots || ""),
      target_hint: String(entry.target_hint || entry.description || entry.notes || ""),
    }))
    .filter((entry) => entry.task && entry.preferred_screenshot);
}

function buildRelativeImageMap(imageFiles) {
  const map = {};
  for (const filePath of imageFiles) {
    map[path.basename(filePath)] = path.relative(SUPPORT_AGENT_DATA_ROOT, filePath);
  }
  return map;
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function taskScore(question, task) {
  const questionTokens = new Set(tokenize(question));
  const taskTokens = tokenize(task);
  let score = 0;
  for (const token of taskTokens) {
    if (questionTokens.has(token)) score += 1;
  }
  if (String(question || "").toLowerCase().includes(task)) score += 20;
  return score;
}

function findTaskOverride(question, taskMap, screenshotIndex) {
  const loweredQuestion = String(question || "").toLowerCase();
  if (
    /\bline\s*items?\b/.test(loweredQuestion) ||
    /\badd\s+(equipment|asset|item)\b/.test(loweredQuestion) ||
    /\badd\s+.*\b(rental\s+order|quote)\b/.test(loweredQuestion)
  ) {
    const targetFile = "p14_01_rental_order_quote_detail_page_2.png";
    const hardOverride = screenshotIndex.find((entry) => path.basename(entry.file) === targetFile);
    if (hardOverride) {
      return {
        ...hardOverride,
        score: 999,
        overrideReason: "Hard override: line-item questions should use Rental Order / Quote Detail Page (2).",
      };
    }
  }

  let best = null;
  for (const row of taskMap || []) {
    const score = taskScore(loweredQuestion, row.task);
    if (!best || score > best.score) best = { ...row, score };
  }
  if (best && best.score >= 2) {
    const preferredBase = path.basename(best.preferred_screenshot);
    const match = screenshotIndex.find((entry) => path.basename(entry.file) === preferredBase);
    if (match) {
      return {
        ...match,
        score: 900 + best.score,
        overrideReason: `Task map match: ${best.task}`,
        target_hint: best.target_hint,
      };
    }
  }
  return null;
}

function scoreCandidate(question, candidate) {
  const questionTokens = new Set(tokenize(question));
  const haystack = `${candidate.caption} ${candidate.feature} ${candidate.screen} ${candidate.description || ""} ${candidate.visible_section || ""} ${candidate.related_tasks || ""} ${candidate.keywords || ""} ${candidate.notes || ""} ${candidate.file}`;
  let score = 0;
  for (const token of tokenize(haystack)) {
    if (questionTokens.has(token)) score += 1;
  }
  if (/rental order/i.test(question) && /rental.*order/i.test(haystack)) score += 4;
  if (/quote/i.test(question) && /quote/i.test(haystack)) score += 4;
  if (/(asset|equipment)/i.test(question) && /(asset|equipment)/i.test(haystack)) score += 4;
  if (/work order/i.test(question) && /work.*order/i.test(haystack)) score += 4;
  if (/customer/i.test(question) && /customer/i.test(haystack)) score += 4;
  if (/(login|sign in)/i.test(question) && /(login|sign)/i.test(haystack)) score += 4;
  return score;
}

function topScreenshotCandidates(question, index, taskMap = [], limit = 8) {
  const override = findTaskOverride(question, taskMap, index);
  let ranked = [...index]
    .map((candidate) => ({ ...candidate, score: scoreCandidate(question, candidate) }))
    .sort((left, right) => right.score - left.score);

  if (override) {
    ranked = [override, ...ranked.filter((candidate) => path.basename(candidate.file) !== path.basename(override.file))];
  }

  return ranked.slice(0, limit).map((candidate) => ({
    screenshot_id: candidate.screenshot_id,
    file: candidate.file,
    caption: candidate.caption,
    page: candidate.page,
    feature: candidate.feature,
    screen: candidate.screen,
    description: candidate.description || "",
    visible_section: candidate.visible_section || "",
    related_tasks: candidate.related_tasks || "",
    keywords: candidate.keywords || "",
    notes: candidate.notes || "",
    overrideReason: candidate.overrideReason || "",
    target_hint: candidate.target_hint || "",
    score: candidate.score,
  }));
}

function safeJsonFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // Ignore and try fenced content.
  }
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch (_error) {
      return null;
    }
  }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  try {
    return JSON.parse(objectMatch[0]);
  } catch (_error) {
    return null;
  }
}

async function uploadToOpenAiAndCreateVectorStore(manualName, searchableFiles) {
  const client = getOpenAiClient();
  const vectorStore = await client.vectorStores.create({ name: manualName });
  for (const filePath of searchableFiles) {
    const uploaded = await client.files.create({
      file: fs.createReadStream(filePath),
      purpose: "assistants",
    });
    await client.vectorStores.files.create(vectorStore.id, {
      file_id: uploaded.id,
      attributes: {
        kind: path.basename(filePath).toLowerCase().includes("screenshot") ? "screenshot_index" : "manual_text",
      },
    });
  }
  await waitForVectorStore(vectorStore.id);
  return vectorStore.id;
}

async function waitForVectorStore(vectorStoreId) {
  const client = getOpenAiClient();
  const startedAt = Date.now();
  while (Date.now() - startedAt < VECTOR_STORE_TIMEOUT_MS) {
    const files = await client.vectorStores.files.list(vectorStoreId, { limit: 100 });
    const statuses = files.data.map((entry) => entry.status);
    if (statuses.length && statuses.every((status) => status === "completed")) return;
    if (statuses.some((status) => status === "failed")) {
      throw new Error(`A vector-store file failed indexing: ${JSON.stringify(statuses)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `Vector store indexing timed out after ${Math.round(VECTOR_STORE_TIMEOUT_MS / 1000)} seconds.`
  );
}

async function generateGroundedAnswer({ question, vectorStoreId, candidates, includeScreenshots = true }) {
  const client = getOpenAiClient();
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
- For questions about adding or editing line items on rental orders, use the candidate whose file is p14_01_rental_order_quote_detail_page_2.png.
- If the user does not need a visual, set screenshot_file and target_label to null.
- If documentation is unclear, say that in answer_markdown.
`;

  const response = await client.responses.create({
    model: ANSWER_MODEL,
    input: [
      { role: "developer", content: [{ type: "input_text", text: developerPrompt }] },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `User question: ${question}\n\nincludeScreenshots: ${includeScreenshots}\n\nScreenshot candidates:\n${JSON.stringify(candidates, null, 2)}`,
          },
        ],
      },
    ],
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
        max_num_results: 6,
      },
    ],
    include: ["file_search_call.results"],
  });

  const text = response.output_text || "";
  const parsed = safeJsonFromText(text);
  if (parsed && parsed.answer_markdown) return parsed;
  return {
    answer_markdown: text || "I could not generate an answer from the documentation.",
    screenshot_file: null,
    target_label: null,
    visual_instruction: null,
    confidence: 0,
  };
}

async function locateTargetWithVision(imagePath, targetLabel, instruction) {
  const client = getOpenAiClient();
  const meta = await sharp(imagePath).metadata();
  const data = await fsp.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase().replace(".", "") || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = `data:${mime};base64,${data.toString("base64")}`;
  const prompt = `
Find the UI element to annotate in this screenshot.
Target label: ${targetLabel || "most relevant UI element"}
Instruction: ${instruction || ""}
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
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
  });
  const parsed = safeJsonFromText(response.output_text || "");
  if (!parsed) return null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const x = clamp(parsed.x, 0, meta.width || 0);
  const y = clamp(parsed.y, 0, meta.height || 0);
  const width = clamp(parsed.width, 10, (meta.width || 0) - x);
  const height = clamp(parsed.height, 10, (meta.height || 0) - y);
  return {
    found: Boolean(parsed.found),
    x,
    y,
    width,
    height,
    label: String(parsed.label || targetLabel || "Click here"),
  };
}

async function annotateImage(imagePath, box, outputPath) {
  const meta = await sharp(imagePath).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 800;
  const strokeWidth = Math.max(5, Math.round(Math.min(width, height) * 0.006));
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = Math.max(box.width / 2 + 12, 24);
  const ry = Math.max(box.height / 2 + 12, 24);
  const labelX = Math.max(10, Math.min(width - 220, box.x));
  const labelY = Math.max(24, box.y - 12);
  const escapedLabel = String(box.label || "Click here").replace(/[&<>]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  }[char]));
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#ff3b30" stroke-width="${strokeWidth}"/>
    <rect x="${labelX}" y="${labelY - 24}" width="${Math.min(260, escapedLabel.length * 9 + 30)}" height="28" rx="8" fill="#ff3b30"/>
    <text x="${labelX + 12}" y="${labelY - 5}" font-size="16" font-family="Arial, sans-serif" font-weight="700" fill="white">${escapedLabel}</text>
  </svg>`;
  await sharp(imagePath).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(outputPath);
}

function safeRelativeDataPath(value) {
  const raw = String(value || "").replace(/\\/g, "/").trim();
  if (!raw || raw.includes("\0")) return null;
  const resolved = path.resolve(SUPPORT_AGENT_DATA_ROOT, raw);
  const relative = path.relative(SUPPORT_AGENT_DATA_ROOT, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return { resolved, relative };
}

function resolveManifestFilePath(relativePath) {
  const safe = safeRelativeDataPath(relativePath);
  return safe ? safe.resolved : null;
}

function buildFileUrl(relativePath) {
  return `/api/support-agent/file?path=${encodeURIComponent(String(relativePath || "").replace(/\\/g, "/"))}`;
}

async function extractZipBufferToDir(buffer, targetDir) {
  const zip = new AdmZip(buffer);
  for (const entry of zip.getEntries()) {
    const entryName = String(entry.entryName || "").replace(/\\/g, "/");
    if (!entryName || entryName.includes("\0")) continue;
    if (/^__macosx\//i.test(entryName) || /\/\.ds_store$/i.test(entryName) || /^\.ds_store$/i.test(entryName)) continue;
    const destination = path.resolve(targetDir, entryName);
    const relative = path.relative(targetDir, destination);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Unsafe ZIP entry path: ${entryName}`);
    }
    if (entry.isDirectory) {
      await fsp.mkdir(destination, { recursive: true });
      continue;
    }
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, entry.getData());
  }
}

async function processSupportManualUpload({ manualId, uploadedName, zipBuffer }) {
  await ensureSupportAgentDirs();
  const manualDir = path.join(SUPPORT_AGENT_MANUALS_ROOT, makeManualStorageName(manualId));
  await fsp.rm(manualDir, { recursive: true, force: true });
  await fsp.mkdir(manualDir, { recursive: true });
  await extractZipBufferToDir(zipBuffer, manualDir);

  const files = walkFiles(manualDir);
  const imageFiles = files.filter((filePath) => /\.(png|jpg|jpeg|webp)$/i.test(filePath));
  const manualTextFile = findBestManualTextFile(files);
  const indexFile = findIndexFile(files);
  const taskMapFile = findTaskMapFile(files);

  if (!manualTextFile) {
    throw new Error("Could not find a .md, .txt, .json, or .csv manual file in the ZIP.");
  }

  const screenshotIndex = await loadScreenshotIndex(indexFile, imageFiles);
  const taskMap = await loadTaskScreenshotMap(taskMapFile);
  const imageMap = buildRelativeImageMap(imageFiles);
  const normalizedIndexPath = path.join(manualDir, "normalized_screenshot_index.json");
  const normalizedTaskMapPath = path.join(manualDir, "normalized_task_screenshot_map.json");
  await fsp.writeFile(normalizedIndexPath, JSON.stringify(screenshotIndex, null, 2));
  await fsp.writeFile(normalizedTaskMapPath, JSON.stringify(taskMap, null, 2));

  const vectorStoreId = await uploadToOpenAiAndCreateVectorStore(`RentSoft support ${manualId}`, [
    manualTextFile,
    normalizedIndexPath,
    normalizedTaskMapPath,
  ]);

  return {
    name: path.parse(String(uploadedName || "")).name || `Support Manual ${manualId}`,
    vectorStoreId,
    screenshotCount: screenshotIndex.length,
    manifest: {
      manualStorageKey: makeManualStorageName(manualId),
      manualDir: path.relative(SUPPORT_AGENT_DATA_ROOT, manualDir),
      manualTextFile: path.relative(SUPPORT_AGENT_DATA_ROOT, manualTextFile),
      indexFile: path.relative(SUPPORT_AGENT_DATA_ROOT, normalizedIndexPath),
      taskMapFile: path.relative(SUPPORT_AGENT_DATA_ROOT, normalizedTaskMapPath),
      screenshotIndex,
      taskMap,
      imageMap,
    },
  };
}

async function answerSupportQuestion({ manual, question, includeScreenshots = true }) {
  if (!manual?.manifest?.vectorStoreId && !manual?.vectorStoreId) {
    throw new Error("Support manual is missing its vector store.");
  }
  const manifest = manual.manifest || {};
  const candidates = includeScreenshots
    ? topScreenshotCandidates(question, manifest.screenshotIndex || [], manifest.taskMap || [], 8)
    : [];

  const answer = await generateGroundedAnswer({
    question,
    vectorStoreId: manual.vectorStoreId || manifest.vectorStoreId,
    candidates,
    includeScreenshots,
  });

  let annotatedImageUrl = null;
  let originalImageUrl = null;
  let chosenScreenshot = null;

  if (includeScreenshots && answer.screenshot_file) {
    const fileName = path.basename(answer.screenshot_file);
    const relativeImagePath = manifest.imageMap ? manifest.imageMap[fileName] : null;
    const absoluteImagePath = resolveManifestFilePath(relativeImagePath);
    if (absoluteImagePath && fs.existsSync(absoluteImagePath)) {
      chosenScreenshot = fileName;
      originalImageUrl = buildFileUrl(relativeImagePath);
      const box = await locateTargetWithVision(absoluteImagePath, answer.target_label, answer.visual_instruction);
      if (box) {
        const outName = `manual-${manual.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
        const outPath = path.join(SUPPORT_AGENT_ANNOTATED_ROOT, outName);
        await annotateImage(absoluteImagePath, box, outPath);
        annotatedImageUrl = buildFileUrl(path.relative(SUPPORT_AGENT_DATA_ROOT, outPath));
      }
    }
  }

  return {
    answer: answer.answer_markdown,
    chosenScreenshot,
    targetLabel: answer.target_label,
    annotatedImageUrl,
    originalImageUrl,
    confidence: answer.confidence,
    candidates,
    includeScreenshots,
  };
}

async function resolveSupportAgentFile(relativePath) {
  const safe = safeRelativeDataPath(relativePath);
  if (!safe) return null;
  try {
    const stat = await fsp.stat(safe.resolved);
    if (!stat.isFile()) return null;
    return safe.resolved;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  processSupportManualUpload,
  answerSupportQuestion,
  resolveSupportAgentFile,
};
