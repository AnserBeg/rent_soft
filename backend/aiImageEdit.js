const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

let cachedClientPromise = null;

function geminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_KEY || "";
}

function geminiImageModel() {
  return process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
}

function extensionForMime(mime) {
  switch (String(mime || "").toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

async function convertBufferToWebp(buffer, { quality = 82 } = {}) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  if (!input.length) throw new Error("Missing image buffer.");
  return sharp(input, { failOnError: false, animated: true }).webp({ quality }).toBuffer();
}

async function getGeminiClient() {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

  if (!cachedClientPromise) {
    cachedClientPromise = import("@google/genai").then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
  }
  return cachedClientPromise;
}

function extractInlineImageFromResponse(response) {
  const candidates = response?.candidates || response?.response?.candidates || response?.data?.candidates || [];
  const parts = candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (inline?.data) {
      return {
        base64: String(inline.data),
        mimeType: inline.mimeType ? String(inline.mimeType) : "image/png",
      };
    }
  }
  return null;
}

async function editImageBufferWithGemini({ inputBuffer, inputMimeType, prompt }) {
  const buf = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer || "");
  if (!buf.length) throw new Error("Missing input image.");

  const promptText = String(prompt || "").trim();
  if (!promptText) throw new Error("prompt is required.");
  if (promptText.length > 1800) throw new Error("prompt is too long.");

  const ai = await getGeminiClient();
  const model = geminiImageModel();

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: buf.toString("base64"),
            mimeType: String(inputMimeType || "application/octet-stream"),
          },
        },
        { text: promptText },
      ],
    },
  });

  const image = extractInlineImageFromResponse(response);
  if (!image?.base64) throw new Error("No image data returned by AI model.");

  const outputBuffer = Buffer.from(image.base64, "base64");
  if (!outputBuffer.length) throw new Error("AI image data was empty.");
  return { outputBuffer, outputMimeType: image.mimeType || "image/png" };
}

async function writeCompanyUpload({ uploadRoot, companyId, buffer, mimeType }) {
  const cidNum = Number(companyId);
  if (!Number.isFinite(cidNum) || cidNum <= 0) throw new Error("companyId is required.");
  const cid = String(Math.trunc(cidNum));

  let outputBuffer = buffer;
  try {
    if (String(mimeType || "").toLowerCase() !== "image/webp") {
      outputBuffer = await convertBufferToWebp(buffer);
    }
  } catch {
    throw new Error("Unable to convert image to WebP.");
  }

  const ext = ".webp";
  const dir = path.join(uploadRoot, `company-${cid}`);
  const safeDir = path.resolve(dir);
  const rel = path.relative(path.resolve(uploadRoot), safeDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid upload path.");
  }
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(dir, filename);
  await fs.promises.writeFile(fullPath, outputBuffer);
  return { url: `/uploads/company-${cid}/${filename}`, fullPath };
}

module.exports = {
  editImageBufferWithGemini,
  writeCompanyUpload,
};
