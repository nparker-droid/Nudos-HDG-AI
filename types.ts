
/**
 * Definición de los materiales permitidos para las piezas hidráulicas
 */
export enum NodeMaterial {
  HDPE = 'HDPE',
  PVC = 'PVC',
  FeFdo = 'Fe Fdo',
  Acero = 'Acero',
  Bronce = 'Bronce',
  Hormigon = 'Hormigón',
  Otro = 'Otro'
}

export type NodeType = 'Numerico' | 'Ventosa' | 'Desague' | 'Corte' | 'Reductora' | 'Grifo' | 'Camara' | 'Otro';

export type HdpeUnionType = 'TF' | 'EL';

/**
 * Representa un componente individual dentro de un nudo (ej. Codo, Válvula)
 */
export interface Piece {
  name: string;
  material: NodeMaterial;
  diameter: string;
  quantity: number;
  union?: string; // Ej: EL-EL, Br-Br, EL-Br
  unionCount?: number;
  hasMechanism?: boolean;
  weight?: number; // Peso unitario en kg o kg/m
  price?: number;  // Precio unitario CLP sin IVA (desde catálogo)
  notes?: string;
}

/**
 * Representa un nudo hidráulico completo
 */
export interface HydraulicNode {
  id: string;
  nodeName: string;
  type: NodeType;
  pieces: Piece[];
  anchorageCount: number;
  sourceGroupings?: string[];
  docIndex?: number; // Índice del documento subido (1, 2, 3...)
  isManual?: boolean;
}

/**
 * Versión del nudo para la biblioteca persistente
 */
export interface LibraryNode extends Omit<HydraulicNode, 'id'> {
  libraryId: string;
}

/**
 * Estructura de la respuesta procesada por la IA Gemini
 */
export interface AnalysisResult {
  nodes: HydraulicNode[];
  summary: string;
}

/**
 * Estado de una captura de imagen y su respectivo análisis
 */
export interface FileAnalysis {
  id: string;
  image: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  result?: AnalysisResult;
  error?: string;
  customName?: string; // Nombre personalizado del plano/documento
}

/**
 * Agrupación lógica de nudos
 */
export interface Category {
  id: string;
  name: string;
  analyses: FileAnalysis[];
}

/**
 * Entidad principal del proyecto
 */
export interface Project {
  id: string;
  code: string;
  name: string;
  date: string;
  description: string;
  version: string;
  stage: string;
  commune: string;
  region: string;
  hdpeUnionType?: HdpeUnionType;
  categories: Category[];
}

export interface CatalogItem {
  id: string;
  categoria: string;     // Tuberias, Fittings, Bridas, Valvulas, Juntas de expansion
  tipoPieza: string;     // Codo 90°, Tuberia, Tee, etc.
  material: string;      // HDPE, PVC, Acero carbono, Fierro ductil, etc.
  diametroMm: number;    // 90, 110, 160, etc.
  diametroPulg: string;  // "3", "4", "6", etc.
  resistencia: string;   // PN10, PN16, STD, SCH40, etc.
  union: string;         // EF, TF, S/R, Brida, etc.
  pesoValor: number;     // valor numérico del peso
  pesoUnidad: string;    // 'kg' (fitting) | 'kg/m' (tubería)
  precio: number | null; // CLP sin IVA, null si no hay dato
  descripcion: string;
}
