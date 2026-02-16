// @google/genai SDK used for hydraulic plan analysis
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult } from "../types.ts";

const SYSTEM_PROMPT = `
Eres un Asistente Experto en Interpretación de Planos Hidráulicos y Gestión de Inventarios de Redes de Agua Potable.
Tu objetivo es analizar imágenes de "Cuadros de Nudos" y extraer un inventario técnico 100% preciso, sin omitir ningún número de nudo.

REGLAS CRÍTICAS DE ESCANEO:
1. IDENTIFICACIÓN DE NUDOS: Debes buscar números correlativos (01, 02, 03...) en títulos, subtítulos, dentro de paréntesis (ej: "(01, 02, 03)") y en etiquetas laterales. NO omitas nudos.
2. CORRELATIVIDAD: Verifica que la secuencia sea lógica. Si detectas un salto (ej: del 05 al 08), realiza un segundo escaneo profundo en la imagen para encontrar los números intermedios.
3. UNIFICACIÓN DE ESQUEMAS: Si un mismo dibujo o detalle gráfico aplica a varios números de nudo (ej: un detalle que dice "Codo 90° (01, 02, 03, 04)"), genera UN SOLO objeto 'HydraulicNode'. 
   - En el campo 'id', pon el rango o lista completa encontrada.
   - En el campo 'sourceGroupings', incluye un array con cada número individual detectado.
4. PIEZAS: Extrae Codos (con grados), Tees, Válvulas, Uniones, Reducciones. Identifica Material y Diámetro de cada una.
5. ANCLAJES: Cuenta los bloques de hormigón (trapecios achurados) específicos de cada detalle.
6. MATRIZ: La tubería matriz es contexto, no una pieza del nudo.

RESPONDE SIEMPRE EN FORMATO JSON ESTRUCTURADO SIGUIENDO EL SCHEMA PROPORCIONADO.
`;

let inFlight = false;

export async function analyzeHydraulicPlan(base64Data: string): Promise<AnalysisResult> {
  if (inFlight) {
    throw new Error("Análisis en curso. Espera a que termine antes de reintentar.");
  }

  inFlight = true;

  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("Falta la API Key. Configura API_KEY en el entorno.");

    const ai = new GoogleGenAI({ apiKey });

    const mimeTypeMatch = base64Data.match(/^data:([^;]+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";
    const base64Clean = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;

    const MODEL_ID = "gemini-3-flash-preview";

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: MODEL_ID,
      contents: {
        parts: [
          {
            inlineData: { mimeType, data: base64Clean },
          },
          {
            text:
              "Realiza un análisis exhaustivo y detallado de este cuadro de nudos. " +
              "Presta especial atención a los números correlativos. Identifica CADA nudo, incluso si comparten el mismo esquema. " +
              "Si varios nudos usan el mismo esquema, agrúpalos y nómbralos en el campo 'id' y 'sourceGroupings'. " +
              "Para cada esquema, lista piezas, materiales, diámetros y cuenta los anclajes de hormigón.",
          },
        ],
      },
      config: {
        systemInstruction: SYSTEM_PROMPT,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Número o lista de números del nudo (ej: '01, 02, 03')" },
                  sourceGroupings: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "Lista de IDs individuales que fueron unificados en este esquema"
                  },
                  nodeName: { type: Type.STRING, description: "Nombre descriptivo del nudo (ej: CODO DE 90 GRADOS)" },
                  type: {
                    type: Type.STRING,
                    enum: ["Numerico", "Ventosa", "Desague", "Corte", "Reductora"],
                  },
                  anchorageCount: { type: Type.NUMBER, description: "Cantidad de anclajes de hormigón detectados" },
                  pieces: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        material: { type: Type.STRING },
                        diameter: { type: Type.STRING },
                        quantity: { type: Type.INTEGER },
                        weight: { type: Type.NUMBER },
                      },
                    },
                  },
                },
              },
            },
            summary: { type: Type.STRING, description: "Resumen técnico de la cantidad de nudos encontrados y unificados" },
          },
          required: ["nodes", "summary"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("La IA no devolvió texto.");

    try {
      return JSON.parse(text) as AnalysisResult;
    } catch (err) {
      console.error("Respuesta cruda (no JSON):", text);
      throw new Error("El modelo respondió, pero NO devolvió JSON válido.");
    }
  } catch (err: any) {
    console.error("Gemini error:", err);
    const msg = err?.message || String(err);
    throw new Error(msg);
  } finally {
    inFlight = false;
  }
}