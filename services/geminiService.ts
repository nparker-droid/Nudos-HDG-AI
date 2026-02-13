
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, NodeMaterial } from "../types.ts";

/**
 * Prompt de sistema: Define el comportamiento y las reglas de negocio para la IA.
 */
const SYSTEM_PROMPT = `
Eres un Asistente Experto en Interpretación de Planos Hidráulicos y Gestión de Inventarios, con un enfoque obsesivo en la precisión del conteo.
Tu función es procesar exhaustivamente imágenes de "Cuadros de Nudos" y convertirlos en datos estructurados. No debes omitir ninguna pieza y tu conteo debe ser exacto.

REGLAS DE EXTRACCIÓN Y CONTEO DE PIEZAS (MÁXIMA PRIORIDAD):
1.  **Diferenciar Matriz de Pieza Especial**:
    -   Texto como "HDPE. DN = 75 mm." o "Ac. ASTM-53 Sch40 Galv. DN=XX" describe la red principal (matriz). **NO ES UNA PIEZA** y no debe listarse. Es solo contexto.
    -   Texto como "TROZO HDPE 75mm", "COPLA", "TEE", y los codos (ej. "1/4") **SÍ SON PIEZAS** del nudo y deben ser incluidas.
2.  **CONTEO ESTRICTO DE TODAS LAS INSTANCIAS**: Tu tarea principal es contar CADA APARICIÓN de una etiqueta o símbolo. No asumas ni agrupes visualmente.
    -   **EJEMPLO NUDO 29**: Si la etiqueta "TROZO HDPE 75mm" aparece escrita 4 veces, la cantidad es 4. Si la fracción "1/4" aparece 3 veces, la cantidad para "Codo 90°" es 3. Si "COPLA Ef-Ef" aparece escrita 1 vez, la cantidad es 1. ¡Este nivel de precisión es mandatorio!
3.  **Codos (Cambios de Dirección)**:
    -   Las fracciones indican el ángulo:
        -   **1/4 = Codo 90°**
        -   1/8 = Codo 45°
        -   1/16 = Codo 22.5° (o Curva 22,5°)
    -   Cuenta cada fracción por separado. Tres apariciones de "1/4" son 3 codos.
4.  **Anclajes (Machón de Apoyo)**:
    -   Cuenta todas las figuras geométricas que representan anclajes. Son **trapecios achurados en gris**.
    -   **EJEMPLO NUDO 29**: Si hay 4 de estas figuras, el campo 'anchorageCount' DEBE SER 4.
5.  **Incertidumbre**: Si no estás seguro de un dato (nombre, material, diámetro), inclúyelo pero deja el campo vacío para revisión humana. **No omitas la pieza**.

REGLA DE UNIFICACIÓN DE ESQUEMAS REPETIDOS:
- Si encuentras varios esquemas (dibujos) que son idénticos pero están separados en el documento, debes unificarlos.
- Para estos esquemas repetidos y unificados:
    - El campo 'id' DEBE contener TODOS los números de nudo de todos los esquemas repetidos, separados por comas.
    - El campo 'nodeName' DEBE ser un nombre genérico.
    - El campo 'sourceGroupings' es CRUCIAL: debe ser un array de strings, donde cada string contiene los números de nudo de CADA UNO de los esquemas originales. Ejemplo: ["02, 05", "07, 13"].
- Si un solo esquema en el documento se aplica a varios números de nudo, pon todos los números en 'id' y NO incluyas 'sourceGroupings'.

Reglas Generales de Extracción:
1. Materialidad: Identificar si es HDPE, Fe Fdo, Acero, Bronce u Hormigón.
2. Diámetro: Extraer el diámetro nominal (DN).
3. Cantidad: Unidades por CADA nudo del grupo.
`;

export async function analyzeHydraulicPlan(base64Data: string): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const mimeTypeMatch = base64Data.match(/^data:([^;]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";
  const base64Clean = base64Data.split(',')[1] || base64Data;

  const mediaPart = {
    inlineData: {
      mimeType: mimeType,
      data: base64Clean,
    },
  };

  const textPrompt = `Analiza la imagen del plano hidráulico y extrae el inventario de nudos.`;

  // Fix: Updated model and added response schema for robust JSON output.
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [ 
      {
        parts: [
          mediaPart, 
          { text: textPrompt }
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
                type: { type: Type.STRING, description: "Must be one of: 'Numerico', 'Ventosa', 'Desague', 'Corte', 'Reductora'" },
                anchorageCount: { type: Type.NUMBER },
                sourceGroupings: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Only include for repeated schemes. Each string is a group of node IDs from an original scheme, e.g., ['02, 05', '07, 13']"
                },
                pieces: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      material: { type: Type.STRING, description: "Must be one of: 'HDPE', 'Fe Fdo', 'Acero', 'Bronce', 'Hormigón', 'Otro', or empty string" },
                      diameter: { type: Type.STRING },
                      quantity: { type: Type.INTEGER },
                      weight: { type: Type.NUMBER }
                    },
                    required: ['name', 'material', 'diameter', 'quantity']
                  }
                }
              },
              required: ['id', 'nodeName', 'type', 'anchorageCount', 'pieces']
            }
          },
          summary: { type: Type.STRING }
        },
        required: ['nodes', 'summary']
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Respuesta vacía de la IA");
  
  try {
    // Fix: With JSON response type set, markdown cleaning is not necessary.
    const cleanText = text.trim();
    return JSON.parse(cleanText) as AnalysisResult;
  } catch (e) {
    console.error("Error al parsear JSON de la IA:", text);
    throw new Error("La respuesta de la IA no es un JSON válido.");
  }
}