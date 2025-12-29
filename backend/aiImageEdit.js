const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
  const cid = String(companyId || "").trim();
  if (!cid) throw new Error("companyId is required.");

  const ext = extensionForMime(mimeType);
  const dir = path.join(uploadRoot, `company-${cid}`);
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(dir, filename);
  await fs.promises.writeFile(fullPath, buffer);
  return { url: `/uploads/company-${cid}/${filename}`, fullPath };
}

module.exports = {
  editImageBufferWithGemini,
  writeCompanyUpload,
};

