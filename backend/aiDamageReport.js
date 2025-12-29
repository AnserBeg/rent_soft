const path = require("path");
const fs = require("fs");

let cachedClientPromise = null;

function geminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_KEY || "";
}

function geminiModel() {
  return process.env.GEMINI_MODEL || "gemini-3-pro-preview";
}

function mimeFromExtension(filename) {
  const ext = String(path.extname(filename || "")).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

async function getGeminiClient() {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

  if (!cachedClientPromise) {
    cachedClientPromise = import("@google/genai").then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
  }
  return cachedClientPromise;
}

function promptForDamageReport({ beforeNotes, afterNotes, extraContext } = {}) {
  const before = String(beforeNotes || "").trim();
  const after = String(afterNotes || "").trim();
  const context = String(extraContext || "").trim();

  const notesBlock =
    before || after
      ? `\n\nINSPECTOR NOTES (may be incomplete):\n- Before notes: ${before ? before : "(none)"}\n- After notes: ${
          after ? after : "(none)"
        }\n`
      : "";

  const contextBlock = context ? `\n\nCONTEXT:\n${context}\n` : "";

  return `
You are an expert damage assessment AI for rental equipment, rental properties, and vehicles.
Your task is to analyze two sets of images: "Before" and "After" a rental period.

OBJECTIVE:
Create a detailed, professional damage report comparing the condition of the subject.

INSTRUCTIONS:
1. Analyze the "Before" images to establish the baseline condition and note any pre-existing defects.
2. Analyze the "After" images to identify current condition.
3. Compare them meticulously to identify *new* damages that occurred during the rental.
4. Distinguish between normal wear and tear versus actionable damage.
5. If something is visible in "After" but not "Before" (or vice versa) and it is relevant to condition/damage, note it.
6. If image evidence is insufficient or ambiguous, say so explicitly (do not guess).

FORMATTING:
- Use Markdown.
- Start with a short Summary.
- Use a table for specific issues found with columns: Location/Part, Before, After, Change, Severity, Recommended action.
- Use bolding for emphasis on critical new damages.
- Be objective and suitable for an invoice/claim dispute.
${contextBlock}${notesBlock}
Please process the inputs in the order provided below.
  `.trim();
}

function bufferToInlinePart(buffer, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(buffer).toString("base64"),
      mimeType: String(mimeType || "application/octet-stream"),
    },
  };
}

async function generateDamageReportMarkdown({
  beforeImages = [],
  afterImages = [],
  beforeNotes,
  afterNotes,
  extraContext,
} = {}) {
  const before = Array.isArray(beforeImages) ? beforeImages : [];
  const after = Array.isArray(afterImages) ? afterImages : [];
  if (!before.length || !after.length) {
    throw new Error("Provide at least 1 Before image and 1 After image.");
  }

  const ai = await getGeminiClient();
  const model = geminiModel();

  const prompt = promptForDamageReport({ beforeNotes, afterNotes, extraContext });

  const parts = [
    { text: prompt },
    { text: "\n\n--- SET 1: BEFORE IMAGES (Baseline Condition) ---" },
    ...before,
    { text: "\n\n--- SET 2: AFTER IMAGES (Current Condition) ---" },
    ...after,
  ];

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      systemInstruction: "You are a professional, detail-oriented insurance adjuster and damage inspector.",
    },
  });

  const text = response?.text ? String(response.text) : "";
  if (!text.trim()) throw new Error("No report generated.");
  return text;
}

async function readImageAsInlinePart({ fullPath, mimeType }) {
  const buf = await fs.promises.readFile(fullPath);
  return bufferToInlinePart(buf, mimeType);
}

module.exports = {
  mimeFromExtension,
  readImageAsInlinePart,
  generateDamageReportMarkdown,
};

