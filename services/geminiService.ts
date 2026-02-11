import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

export const sendMessageToGeminiStream = async (
  prompt: string, 
  history: { role: 'user' | 'model', parts: { text: string }[] }[],
  userName: string,
  onChunk: (text: string) => void,
  attachment?: { data: string, mimeType: string },
  isOperatorMode: boolean = false
): Promise<void> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  
  try {
    if (attachment) {
      // For actual image editing (like background removal or object modification), 
      // we use gemini-2.5-flash-image which supports generating new image data.
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: attachment.data, mimeType: attachment.mimeType } },
            { text: prompt || "Analyze and edit this image professionally." }
          ]
        },
        config: {
          systemInstruction: isOperatorMode 
            ? "You are a Senior Human Operator and master visual editor. Primary language: English. Execute the requested image modifications perfectly."
            : "You are Xino, a professional AI visual editor. Primary language: English. When a user provides an image and a request (like 'remove background', 'edit', or 'change'), your goal is to generate the modified image. Output the resulting image data directly.",
        }
      });

      let foundImage = false;
      const parts = response.candidates?.[0]?.content?.parts || [];
      
      for (const part of parts) {
        if (part.inlineData) {
          // Send back the protocol-prefixed base64 string
          const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          onChunk(`[IMAGE_EDIT_COMPLETE] ${imageUrl}`);
          foundImage = true;
        } else if (part.text) {
          onChunk(part.text);
        }
      }
      
      if (!foundImage && parts.length === 0) {
        onChunk("Neural processor failed to generate visual data. Check instruction clarity.");
      }
      
    } else {
      // Standard chat stream for text conversations
      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        history: history,
        config: {
          systemInstruction: isOperatorMode 
            ? `You are a Senior Human Operator at Xino Neural Network. Primary language: English. Provide expert human assistance.`
            : `You are Xino, a professional AI assistant developed by UMT students. Primary language: English. Be formal, direct, and use standard punctuation. No asterisks.`,
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 0 }
        },
      });

      const result = await chat.sendMessageStream({ message: prompt });
      for await (const chunk of result) {
        if (chunk.text) onChunk(chunk.text);
      }
    }
  } catch (error) {
    console.error("Gemini Multi-engine Error:", error);
    onChunk("Neural connection error. Visual processing failed to initialize.");
  }
};

export const sendMessageToGemini = async (
  prompt: string, 
  history: { role: 'user' | 'model', parts: { text: string }[] }[],
  userName: string,
  attachment?: { data: string, mimeType: string },
  isOperatorMode: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  try {
    const model = attachment ? 'gemini-2.5-flash-image' : 'gemini-3-flash-preview';
    const parts: any[] = [];
    if (attachment) {
      parts.push({ inlineData: { data: attachment.data, mimeType: attachment.mimeType } });
    }
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: model,
      contents: [
        ...history.map(h => ({ role: h.role, parts: h.parts })),
        { role: 'user', parts }
      ],
      config: {
        systemInstruction: isOperatorMode 
          ? "You are a Senior Human Operator. Primary language: English."
          : `You are Xino. Professional AI. Primary language: English.`,
        temperature: 0.2
      }
    });

    return response.text || "No data.";
  } catch (e) {
    return "Error.";
  }
};