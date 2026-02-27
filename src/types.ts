
/**
 * Definición de los materiales permitidos para las piezas hidráulicas
 */
export enum NodeMaterial {
  HDPE = 'HDPE',
  FeFdo = 'Fe Fdo',
  Acero = 'Acero',
  Bronce = 'Bronce',
  Hormigon = 'Hormigón',
  Otro = 'Otro'
}

/**
 * Representa un componente individual dentro de un nudo (ej. Codo, Válvula)
 */
export interface Piece {
  name: string;
  material: NodeMaterial;
  diameter: string;
  quantity: number;
  union?: string; // Ej: EL-EL, Br-Br, EL-Br
  weight?: number; // Peso unitario en kg
  notes?: string;
}

/**
 * Representa un nudo hidráulico completo
 */
export interface HydraulicNode {
  id: string;
  nodeName: string;
  type: 'Numerico' | 'Ventosa' | 'Desague' | 'Corte' | 'Reductora' | 'Grifo';
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
  categories: Category[];
}

export interface CatalogItem {
  id: string;
  name: string;
  diameter: string;
  weight: number;
  diameterInches: string;
  material: string;
}
