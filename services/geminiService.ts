import { GoogleGenAI, Modality } from "@google/genai";
import { AgeGroup } from "../types";

// Initialize Gemini Client
// NOTE: In a real environment, never expose keys in client-side code if not using a proxy.
// This assumes the environment provides process.env.API_KEY safely.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generate an image based on a prompt suitable for children's books.
 * Updated to use gemini-2.5-flash-image to avoid high-cost quota limits on Imagen.
 */
export const generateImage = async (prompt: string, style: string = 'cartoon style, colorful, vector art'): Promise<string> => {
  try {
    // Using gemini-2.5-flash-image (Nano Banana) for general image generation
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `Generate an image: ${prompt}, ${style}, child friendly, cute.`,
          },
        ],
      },
      // Note: responseMimeType is not supported for nano banana image gen
    });

    // Iterate through parts to find the image
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }
    
    // If no inline data, check if it returned text (sometimes happens on refusal)
    if (response.text) {
        console.warn("Model returned text instead of image:", response.text);
    }
    
    throw new Error("No image data found in response");

  } catch (error) {
    console.error("Image generation failed, falling back to placeholder.", error);
    // Robust fallback to prevent app crash
    return `https://picsum.photos/seed/${encodeURIComponent(prompt).slice(0, 10)}/512/512`;
  }
};

/**
 * Generate text completion or suggestions.
 */
export const generateText = async (prompt: string, ageGroup: AgeGroup): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a gentle, encouraging storyteller for a child aged ${ageGroup}. 
      Keep language simple, positive, and engaging. 
      Task: ${prompt}`,
    });
    return response.text || "";
  } catch (error) {
    console.error("Text generation error:", error);
    return "Something magical happened...";
  }
};

/**
 * Generate 3 simple suggestions for a user who is stuck.
 */
export const generateSuggestions = async (context: 'character' | 'place' | 'time', ageGroup: AgeGroup): Promise<string[]> => {
    try {
        const prompt = `Provide 3 simple, creative options for a ${context} in a children's story. 
        Format as a JSON string array. Example: ["A brave bunny", "A silly robot", "A dancing cat"].`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });

        const text = response.text;
        if (!text) return ["Option 1", "Option 2", "Option 3"];
        return JSON.parse(text) as string[];
    } catch (e) {
        return ["A funny cat", "A big bear", "A flying fish"];
    }
}

/**
 * Generate Audio (TTS) for a page.
 * Voices: 'Kore' (Gentle/Female), 'Puck' (Playful), 'Fenrir' (Deep/Male), 'Zephyr', 'Charon'
 */
export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string | undefined> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }, 
          },
        },
      },
    });
    
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio;
  } catch (error) {
    console.error("Speech generation failed:", error);
    return undefined;
  }
};

/**
 * Generate a full story page content (text + image prompt) based on inputs.
 */
export const generateStorySegment = async (
    inputs: { character: string; place: string; time: string; plot: string }, 
    ageGroup: AgeGroup
): Promise<{ text: string; imagePrompt: string }> => {
    const prompt = `
    Write one short page (2-3 sentences) of a story.
    Character: ${inputs.character}
    Place: ${inputs.place}
    Time: ${inputs.time}
    Plot Context: ${inputs.plot}
    
    Return JSON: { "storyText": "...", "imageDescription": "..." }
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        const data = JSON.parse(response.text || "{}");
        return {
            text: data.storyText || inputs.plot,
            imagePrompt: data.imageDescription || `${inputs.character} in ${inputs.place}`
        };
    } catch (e) {
        return { text: inputs.plot, imagePrompt: inputs.plot };
    }
}