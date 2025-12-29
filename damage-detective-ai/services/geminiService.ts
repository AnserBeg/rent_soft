import { GoogleGenAI } from "@google/genai";
import { UploadedImage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const GEMINI_SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

const fileToPart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  if (GEMINI_SUPPORTED_MIME_TYPES.includes(file.type)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          const base64String = reader.result.split(",")[1];
          resolve({
            inlineData: {
              data: base64String,
              mimeType: file.type,
            },
          });
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        const base64String = dataUrl.split(",")[1];

        URL.revokeObjectURL(url);
        resolve({
          inlineData: {
            data: base64String,
            mimeType: "image/jpeg",
          },
        });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          `Unsupported image format: ${file.type || "unknown"}. Please upload PNG, JPEG, WEBP, HEIC, or HEIF.`
        )
      );
    };

    img.src = url;
  });
};

export const generateDamageReport = async (
  beforeImages: UploadedImage[],
  afterImages: UploadedImage[]
): Promise<string> => {
  try {
    const model = 'gemini-3-pro-preview';

    // Prepare image parts
    const beforeParts = await Promise.all(beforeImages.map(img => fileToPart(img.file)));
    const afterParts = await Promise.all(afterImages.map(img => fileToPart(img.file)));

    const prompt = `
      You are an expert damage assessment AI for rental properties and vehicles.
      Your task is to analyze two sets of images: "Before" and "After" a rental period.

      OBJECTIVE:
      Create a detailed damage report comparing the condition of the item/property.

      INSTRUCTIONS:
      1. Analyze the "Before" images to establish the baseline condition and note any pre-existing defects.
      2. Analyze the "After" images to identify current condition.
      3. Compare them meticulously to identify *new* damages that occurred during the rental.
      4. Distinguish between normal wear and tear versus actionable damage.
      5. If an object is visible in "After" but not "Before" (or vice versa) and it's relevant to damage (e.g. missing parts), note it.

      FORMATTING:
      - Use Markdown.
      - Start with a generic Summary.
      - Use a table for specific issues found.
      - Use bolding for emphasis on critical new damages.
      - Be professional and objective.

      Please process the inputs in the order provided below.
    `;

    // Construct the contents array.
    // We send a text instruction, then the Before images, then a text separator, then After images.
    const contents = [
      { text: prompt },
      { text: "\n\n--- SET 1: BEFORE IMAGES (Baseline Condition) ---" },
      ...beforeParts,
      { text: "\n\n--- SET 2: AFTER IMAGES (Current Condition) ---" },
      ...afterParts,
    ];

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: contents
      },
      config: {
        // Optional: Giving it a thinking budget for better reasoning on complex visual comparisons
        // thinkingConfig: { thinkingBudget: 2048 } // Only supported on 2.5 series currently, sticking to 3-pro for vision quality.
        systemInstruction: "You are a professional, detail-oriented insurance adjuster and damage inspector.",
      }
    });

    if (response.text) {
      return response.text;
    } else {
      throw new Error("No report generated.");
    }

  } catch (error) {
    console.error("Error generating damage report:", error);
    throw error;
  }
};
