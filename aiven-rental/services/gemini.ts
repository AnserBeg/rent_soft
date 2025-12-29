import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini
// Note: API Key is expected to be in process.env.API_KEY
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateListingDetails = async (
  itemName: string, 
  condition: string
): Promise<any> => {
  if (!apiKey) {
    console.warn("No API Key provided for Gemini");
    return {
      description: "AI generation unavailable without API key.",
      suggestedPrice: 0,
      specs: {},
      category: "General"
    };
  }

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      I am listing a piece of equipment on a B2B rental marketplace.
      Item Name: ${itemName}
      Condition: ${condition}
      
      Please generate a JSON object with:
      1. A professional description (2-3 sentences) marketing this to other businesses.
      2. A suggested daily rental price (in USD, number only) based on typical market rates for this type of equipment.
      3. A 'specs' object with 3-4 key technical specifications relevant to this item (e.g., weight, power, capacity).
      4. A 'category' (e.g., Earthmoving, Aerial Lift, Power Generation, Tools).
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            suggestedPrice: { type: Type.NUMBER },
            specs: { 
              type: Type.OBJECT,
              additionalProperties: { type: Type.STRING }
            },
            category: { type: Type.STRING }
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("No text response from Gemini");

  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback if API fails
    return {
      description: `Professional listing for ${itemName}. Well maintained and ready for work.`,
      suggestedPrice: 150,
      specs: { "Note": "Could not auto-fetch specs" },
      category: "General"
    };
  }
};
