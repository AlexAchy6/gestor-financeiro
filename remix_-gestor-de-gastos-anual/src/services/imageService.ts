import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getLogoBase64(imagePart: any): Promise<string | undefined> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: {
      parts: [
        { text: "Extract the logo from this image and return it as a base64 string. Only return the base64 string, nothing else." },
        imagePart
      ]
    }
  });
  return response.text;
}
