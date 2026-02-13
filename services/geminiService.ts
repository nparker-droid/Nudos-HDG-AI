import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult } from "../types.ts";

const SYSTEM_PROMPT = `
Eres un Asistente Experto en Interpretación de Planos Hidráulicos y Gestión de Inventarios. 
Tu función es procesar imágenes de "Cuadros de Nudos" y convertirlos en JSON.

REGLAS:
1. Piezas: Codos, tees, válvulas, uniones.
2. Matriz: Contexto, no pieza.
3. Anclajes: Contar figuras de trapecios.
`;

export async function analyzeHydraulicPlan(base64Data: string): Promise<AnalysisResult> {
  // Obtenemos la key del entorno inyectado por Vercel
  const apiKey = (window as any).process?.env?.API_KEY || "";
  
  // Creamos la instancia solo cuando se llama a la función
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
          { text: "Generar inventario JSON de este plano hidráulico." }
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
                type: { type: Type.STRING },
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
  if (!text) throw new Error("Respuesta vacía de la IA.");
  return JSON.parse(text) as AnalysisResult;
}