import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult } from "../types.ts";

const SYSTEM_PROMPT = `
Eres un Asistente Experto en Interpretación de Planos Hidráulicos y Gestión de Inventarios de Redes de Agua Potable.
Analiza imágenes de "Cuadros de Nudos" y extrae un inventario técnico preciso en JSON.
REGLAS: Identifica Codos, Tees, Válvulas, Diámetros y Anclajes.
`;

export async function analyzeHydraulicPlan(base64Data: string): Promise<AnalysisResult> {
  // Obtenemos la API_KEY directamente del objeto process inyectado globalmente
  const apiKey = (window as any).process?.env?.API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });
  
  const mimeTypeMatch = base64Data.match(/^data:([^;]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";
  const base64Clean = base64Data.split(',')[1] || base64Data;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [ 
      {
        parts: [
          { inlineData: { mimeType, data: base64Clean } }, 
          { text: "Genera el inventario completo de este plano hidráulico en formato JSON basándote en los cuadros de nudos visibles." }
        ] 
      }
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                nodeName: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["Numerico", "Ventosa", "Desague", "Corte", "Reductora"] },
                anchorageCount: { type: Type.NUMBER },
                pieces: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      material: { type: Type.STRING },
                      diameter: { type: Type.STRING },
                      quantity: { type: Type.INTEGER },
                      weight: { type: Type.NUMBER }
                    }
                  }
                }
              }
            }
          },
          summary: { type: Type.STRING }
        },
        required: ['nodes', 'summary']
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No se obtuvo respuesta de la IA.");
  return JSON.parse(text) as AnalysisResult;
}