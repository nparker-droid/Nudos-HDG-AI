import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult } from "../types.ts";

const SYSTEM_PROMPT = `
Eres un Asistente Experto en Interpretación de Planos Hidráulicos y Gestión de Inventarios, con un enfoque obsesivo en la precisión del conteo.
Tu función es procesar exhaustivamente imágenes de "Cuadros de Nudos" y convertirlos en datos estructurados. No debes omitir ninguna pieza y tu conteo debe ser exacto.

REGLAS DE EXTRACCIÓN Y CONTEO DE PIEZAS (MÁXIMA PRIORIDAD):
1.  **Diferenciar Matriz de Pieza Especial**: Matriz (HDPE 75mm, etc) es contexto, NO es pieza. Las piezas son CODOS, TEES, VALVULAS, etc.
2.  **CONTEO ESTRICTO**: Si una etiqueta dice "TEE" 3 veces en el dibujo, la cantidad es 3.
3.  **Codos**: 1/4 = 90°, 1/8 = 45°, 1/16 = 22.5°.
4.  **Anclajes**: Contar cada figura de trapecio achurado.
`;

export async function analyzeHydraulicPlan(base64Data: string): Promise<AnalysisResult> {
  // Intentamos obtener la API KEY del entorno global definido en index.html
  const apiKey = (window as any).process?.env?.API_KEY || "";
  
  if (!apiKey) {
    console.warn("Advertencia: API_KEY no detectada. El análisis podría fallar.");
  }

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
          { text: "Analiza el cuadro de nudos de este plano hidráulico y genera el inventario JSON." }
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
  if (!text) throw new Error("La IA no devolvió contenido.");
  return JSON.parse(text) as AnalysisResult;
}