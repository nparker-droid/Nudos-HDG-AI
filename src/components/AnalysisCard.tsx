
import React, { useState } from 'react';
import { FileAnalysis, HydraulicNode, Project } from '../types';
import ResultDisplay from './ResultDisplay';
import { Maximize2, Minimize2, MessageSquare, Play, Trash2 } from 'lucide-react';

interface AnalysisCardProps {
  analysis: FileAnalysis & { documentNumber: number };
  onProcess: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateAnalysisName: (id: string, newName: string) => void;
  onUpdateNode: (analysisId: string, nodeId: string, updates: Partial<HydraulicNode>) => void;
  onRemoveNode: (analysisId: string, nodeId: string) => void;
  onAddNode: (analysisId: string) => void;
  onSaveToLibrary: (node: HydraulicNode) => void;
  searchTerm: string;
  duplicateIds: Set<string>;
  credits: number;
  onCopyNode: (node: HydraulicNode) => void;
  activeProject?: Project;
}

const AnalysisCard: React.FC<AnalysisCardProps> = ({
  analysis,
  onProcess,
  onRemove,
  onUpdateAnalysisName,
  onUpdateNode,
  onRemoveNode,
  onAddNode,
  onSaveToLibrary,
  searchTerm,
  duplicateIds,
  onCopyNode,
  activeProject
}) => {
  const [showImage, setShowImage] = useState(!analysis.isCollapsed);
  const [localObs, setLocalObs] = useState(analysis.observations || "");

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
      <div className="p-5 flex items-center justify-between bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 text-xs font-bold px-2 py-1 rounded">
            DOC {analysis.documentNumber}
          </div>
          <h3 className="font-semibold">{analysis.customName || "Plano sin nombre"}</h3>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowImage(!showImage)}
            className="text-gray-400 hover:text-white transition-colors"
            title={showImage ? "Contraer imagen" : "Expandir imagen"}
          >
            {showImage ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          
          {analysis.status === 'pending' && (
            <button 
              onClick={() => onProcess(analysis.id)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex items-center gap-2"
            >
              <Play size={14} /> Analizar
            </button>
          )}
          
          <button onClick={() => onRemove(analysis.id)} className="text-gray-500 hover:text-red-500">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {showImage && analysis.image && (
        <div className="bg-black/20 p-2">
          <img 
            src={analysis.image} 
            alt="Plano" 
            className="w-full max-h-96 object-contain rounded border border-gray-700"
          />
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Sección de Observaciones Manuales */}
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2">
            <MessageSquare size={14} />
            <span>Observaciones de este plano</span>
          </div>
          <textarea 
            className="w-full bg-transparent border-none focus:ring-0 text-sm text-gray-300 resize-none h-16"
            placeholder="Escribe notas adicionales o recordatorios sobre este plano..."
            value={localObs}
            onChange={(e) => setLocalObs(e.target.value)}
          />
        </div>

        {analysis.status === 'done' && (
          <ResultDisplay 
            analysisId={analysis.id}
            result={analysis.result || { nodes: [], summary: "" }}
            searchTerm={searchTerm}
            duplicateIds={duplicateIds}
            onUpdateNode={onUpdateNode}
            onRemoveNode={onRemoveNode}
            onAddNode={() => onAddNode(analysis.id)}
            onRemoveAnalysis={() => onRemove(analysis.id)}
            onSaveToLibrary={onSaveToLibrary}
            onProcess={onProcess}
            onCopyNode={onCopyNode}
            isManual={!analysis.image}
            project={activeProject}
          />
        )}

        {analysis.status === 'analyzing' && (
          <div className="flex items-center justify-center py-10 gap-3 text-blue-400">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
            <span>Procesando datos con IA...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisCard;
