
export enum NodeMaterial {
  HDPE = 'HDPE',
  FeFdo = 'Fe Fdo',
  Acero = 'Acero',
  Bronce = 'Bronce',
  Hormigon = 'Hormigón',
  Otro = 'Otro'
}

export interface Piece {
  name: string;
  material: NodeMaterial;
  diameter: string;
  quantity: number;
  union?: string;
  weight?: number;
  notes?: string;
}

export interface HydraulicNode {
  id: string;
  nodeName: string;
  type: 'Numerico' | 'Ventosa' | 'Desague' | 'Corte' | 'Reductora';
  pieces: Piece[];
  anchorageCount: number;
  sourceGroupings?: string[];
  docIndex?: number;
  isManual?: boolean;
}

export interface AnalysisResult {
  nodes: HydraulicNode[];
  summary: string;
}

export interface FileAnalysis {
  id: string;
  image: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  result?: AnalysisResult;
  error?: string;
  customName?: string;
  observations?: string; // Campo para notas manuales
  isCollapsed?: boolean; // Control de UI
}

export interface Category {
  id: string;
  name: string;
  analyses: FileAnalysis[];
}

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
e