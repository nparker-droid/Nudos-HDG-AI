// @google/genai SDK used for hydraulic plan analysis
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult } from "../types.ts";

const SYSTEM_PROMPT = `
Eres un Asistente Experto en Interpretacion de Planos Hidraulicos y Gestion de Inventarios de Redes de Agua Potable.
Tu objetivo es analizar imagenes de "Cuadros de Nudos" y extraer un inventario tecnico 100% preciso, sin omitir ningun numero de nudo.

REGLAS CRITICAS DE ESCANEO:
1. IDENTIFICACION DE NUDOS: Debes buscar numeros correlativos (01, 02, 03...) y nomenclaturas alfanumericas exactas (ej: "G-01", "CV-1", "CD-2") en titulos, subtitulos, dentro de parentesis y en etiquetas laterales. NO omitas nudos.
   - En el campo 'id', conserva exactamente la nomenclatura del plano. No conviertas "G-01" a "C-01", no conviertas "CV-1" a "V-1" y no cambies prefijos propios del proyecto.
   - Usa el campo 'type' solo como clasificacion general. Si la nomenclatura no calza claramente con los tipos definidos, usa "Camara" u "Otro".
2. CORRELATIVIDAD: Verifica que la secuencia sea logica. Si detectas un salto (ej: del 05 al 08), realiza un segundo escaneo profundo en la imagen para encontrar los numeros intermedios.
3. UNIFICACION DE ESQUEMAS: Si encuentras dos o mas bloques de dibujo/detalles graficos que son VISUALMENTE IDENTICOS pero corresponden a diferentes nudos (ej: un detalle para "01, 02" y otro detalle identico para "03, 04"), genera UN SOLO objeto 'HydraulicNode'.
   - En el campo 'id', pon la lista completa de identificadores conservando cada nomenclatura original (ej: "G-01, G-02" o "01, 02, 03, 04").
   - En el campo 'sourceGroupings', incluye un array de strings donde cada string sea el texto de identificacion de cada bloque de dibujo independiente encontrado (ej: ["01, 02", "03, 04"]).
   - SI EL PLANO YA TRAE UN SOLO DIBUJO PARA VARIOS NUDOS (ej: un dibujo que dice "01 al 05"), el array 'sourceGroupings' debe tener UN solo elemento: ["01 al 05"].
4. PIEZAS: Extrae Codos (con grados), Tees, Valvulas, Uniones, Reducciones. Identifica Material y Diametro de cada una. Materiales posibles incluyen HDPE, PVC, Fe Fdo, Acero, Bronce, Hormigon u Otro.
5. ANCLAJES: Cuenta los bloques de hormigon (trapecios achurados) especificos de cada detalle.
6. MATRIZ: La tuberia matriz es contexto, no una pieza del nudo.

RESPONDE SIEMPRE EN FORMATO JSON ESTRUCTURADO SIGUIENDO EL SCHEMA PROPORCIONADO.
`;

let inFlight = false;

export async function analyzeHydraulicPlan(base64Data: string): Promise<AnalysisResult> {
  if (inFlight) {
    throw new Error("Analisis en curso. Espera a que termine antes de reintentar.");
  }

  inFlight = true;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
              "Realiza un analisis exhaustivo y detallado de este cuadro de nudos. " +
              "Presta especial atencion a los identificadores exactos del plano, incluyendo prefijos como G, CV o CD. " +
              "Identifica CADA nudo, incluso si comparten el mismo esquema. " +
              "Si unificas bloques de dibujo identicos que estaban separados en el plano, reflejalo en 'sourceGroupings' con un elemento por cada bloque original.",
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
                  id: { type: Type.STRING, description: "Identificador exacto del plano, incluyendo prefijos si existen (ej: '01', 'G-01', 'CV-1', 'CD-2' o '01, 02, 03')" },
                  sourceGroupings: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Lista de IDs/rangos por cada bloque de dibujo fisico independiente que fue unificado"
                  },
                  nodeName: { type: Type.STRING, description: "Nombre descriptivo del nudo o camara segun plano" },
                  type: {
                    type: Type.STRING,
                    enum: ["Numerico", "Ventosa", "Desague", "Corte", "Reductora", "Grifo", "Camara", "Otro"],
                  },
                  anchorageCount: { type: Type.NUMBER, description: "Cantidad de anclajes de hormigon detectados" },
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
            summary: { type: Type.STRING, description: "Resumen tecnico de la cantidad de nudos encontrados y unificados" },
          },
          required: ["nodes", "summary"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("La IA no devolvio texto.");

    try {
      return JSON.parse(text) as AnalysisResult;
    } catch (err) {
      console.error("Respuesta cruda (no JSON):", text);
      throw new Error("El modelo respondio, pero NO devolvio JSON valido.");
    }
  } catch (err: any) {
    console.error("Gemini error:", err);
    const msg = err?.message || String(err);
    throw new Error(msg);
  } finally {
    inFlight = false;
  }
}
