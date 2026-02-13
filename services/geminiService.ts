import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult } from "../types.ts";

const SYSTEM_PROMPT = `
Eres un Asistente Experto en Interpretación de Planos Hidráulicos y Gestión de Inventarios de Redes de Agua Potable.
Tu objetivo es analizar imágenes de "Cuadros de Nudos" y extraer un inventario técnico preciso.

REGLAS DE INTERPRETACIÓN:
1. PIEZAS: Identifica Codos (especificando grados si aparecen, ej: 90°, 45°), Tees, Válvulas, Uniones, Reducciones.
2. MATERIALES: Traduce abreviaturas (HDPE, FeFdo -> Hierro Fundido, Acero).
3. DIMENSIONES: Extrae diámetros (ej: 75mm, 110mm, 4").
4. ANCLAJES: Cuenta los bloques de hormigón (normalmente representados como trapecios achurados en el esquema).
5. MATRIZ: La tubería matriz (ej: HDPE 110) es el contexto del nudo, NO una pieza del inventario del nudo en sí.

RESPONDE SIEMPRE EN FORMATO JSON ESTRUCTURADO.
`;

export async function analyzeHydraulicPlan(base64Data: string): Promise<AnalysisResult> {
  // Inicialización según directrices del SDK usando el entorno global
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  
  const mimeTypeMatch = base64Data.match(/^data:([^;]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";
  const base64Clean = base64Data.split(',')[1] || base64Data;

  const response: GenerateContentResponse = await ai.models.generateContent({
    /* model: 'gemini-3-pro-preview', // Modelo de alta capacidad para razonamiento técnico */
    model: "ESTO-NO-EXISTE",
    contents: [ 
      {
        parts: [
          { inlineData: { mimeType, data: base64Clean } }, 
          { text: "Analiza exhaustivamente este cuadro de nudos. Identifica cada nudo por su número, lista todas sus piezas especiales con material, diámetro y cantidad, y cuenta los anclajes de hormigón requeridos." }
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
                id: { type: Type.STRING, description: "Número del nudo (ej: 01, 15, 22)" },
                nodeName: { type: Type.STRING, description: "Nombre descriptivo del nudo" },
                type: { type: Type.STRING, enum: ["Numerico", "Ventosa", "Desague", "Corte", "Reductora"] },
                anchorageCount: { type: Type.NUMBER, description: "Cantidad de anclajes de hormigón" },
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
          summary: { type: Type.STRING, description: "Breve resumen técnico de los hallazgos" }
        },
        required: ['nodes', 'summary']
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("La IA no devolvió una respuesta válida.");
  
  try {
    return JSON.parse(text) as AnalysisResult;
  } catch (e) {
    console.error("Error parseando JSON de Gemini:", text);
    throw new Error("El formato de respuesta de la IA no es un JSON válido.");
  }
}