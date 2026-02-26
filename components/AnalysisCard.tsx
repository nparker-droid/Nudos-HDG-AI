import React, { useState } from 'react';
import { HydraulicNode, FileAnalysis, Project, CatalogItem } from '../types.ts';
import ResultDisplay from './ResultDisplay.tsx';

interface AnalysisCardProps {
  analysis: FileAnalysis & { documentNumber?: number };
  onProcess: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateAnalysisName: (id: string, newName: string) => void;
  onUpdateNode: (analysisId: string, nodeId: string, updates: Partial<HydraulicNode>) => void;
  onRemoveNode: (analysisId: string, nodeId: string) => void;
  onSaveToLibrary: (node: HydraulicNode) => void;
  searchTerm: string;
  duplicateIds: Set<string>;
  credits: number;
  onCopyNode: (node: HydraulicNode) => void;
  onAddNode: (analysisId: string) => void;
  catalogItems: CatalogItem[];
}

const AnalysisCard: React.FC<AnalysisCardProps> = ({
  analysis,
  onProcess,
  onRemove,
  onUpdateAnalysisName,
  onUpdateNode,
  onRemoveNode,
  onSaveToLibrary,
  searchTerm,
  duplicateIds,
  credits,
  onCopyNode,
  activeProject,
  onAddNode,
  onExportTable,
  catalogItems
}) => {
  const isManual = !analysis.image;
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(analysis.customName || `DOCUMENTO N° ${analysis.documentNumber || '-'}`);

  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleSaveName = () => {
    onUpdateAnalysisName(analysis.id, tempName);
    setIsEditingName(false);
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col transition-all hover:border-[#88C13E] group w-full mb-10">
      <div
        className="px-10 py-4 bg-slate-50 border-b flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3 flex-grow">
          <div className={`transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}>
            <i className="fa-solid fa-chevron-down text-[#004071] text-xs"></i>
          </div>
          {isEditingName ? (
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="bg-white border border-[#88C13E] rounded px-3 py-1 text-[10px] font-black text-[#004071] uppercase tracking-wider w-64"
                autoFocus
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              />
              <button onClick={handleSaveName} className="text-green-600 hover:text-green-700">
                <i className="fa-solid fa-check text-xs"></i>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/header">
              <span className="text-[10px] font-black text-[#004071] uppercase tracking-[0.2em]">
                {analysis.customName || (isManual ? 'Nudo Manual' : `DOCUMENTO N° ${analysis.documentNumber || '-'}`)}
              </span>
              {!isManual && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTempName(analysis.customName || `DOCUMENTO N° ${analysis.documentNumber || '-'}`);
                    setIsEditingName(true);
                  }}
                  className="text-slate-300 hover:text-[#88C13E] transition-colors opacity-0 group-hover/header:opacity-100"
                  title="Renombrar documento"
                >
                  <i className="fa-solid fa-pen text-[9px]"></i>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isManual && analysis.status === 'done' && (
            <span className="text-[9px] font-black text-[#88C13E] uppercase border border-[#88C13E]/30 px-2 py-0.5 rounded-md">Analizado</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(analysis.id); }}
            className="text-slate-300 hover:text-red-500 transition-colors"
            title="Eliminar documento"
          >
            <i className="fa-solid fa-trash-can text-[11px]"></i>
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {analysis.image && (
            <div className="relative h-28 bg-[#0f172a] flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, #88C13E 25%, transparent 25%, transparent 50%, #88C13E 50%, #88C13E 75%, transparent 75%, transparent)', backgroundSize: '20px 20px' }}></div>
              <div className="flex flex-col items-center gap-2">
                <i className="fa-solid fa-file-invoice text-[#88C13E]/60 text-3xl"></i>
                <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Plano en Memoria de Análisis</span>
              </div>
            </div>
          )}
          <div className="p-8 md:p-12 bg-white flex flex-col w-full">
            {analysis.status === 'pending' && (
              <div className="py-10 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
                  <i className="fa-solid fa-robot text-slate-300 text-3xl"></i>
                </div>
                <h5 className="text-base font-black text-slate-400 uppercase tracking-widest mb-2">Interpretación Automática Disponible</h5>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Consumo: 1 Crédito por análisis</p>
                {onExportTable && (
                  <button
                    onClick={() => onExportTable(analysis.id)}
                    className="px-3 py-1.5 bg-[#88C13E]/10 text-[#88C13E] border border-[#88C13E]/20 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-[#88C13E] hover:text-white transition-colors flex items-center gap-2 mb-4"
                    title="Exportar resumen de piezas de este documento"
                  >
                    <i className="fa-solid fa-table"></i> TABLA
                  </button>
                )}
                <button
                  onClick={() => onProcess(analysis.id)}
                  disabled={credits <= 0}
                  className={`px-10 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-lg active:scale-95 ${credits > 0 ? 'bg-[#004071] text-white hover:bg-[#88C13E] hover:text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  {credits > 0 ? 'INICIAR RECONOCIMIENTO' : 'SIN CRÉDITOS DISPONIBLES'}
                </button>
              </div>
            )}
            {analysis.status === 'analyzing' && (
              <div className="py-12 flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-[6px] border-[#88C13E]/10 border-t-[#88C13E] rounded-full animate-spin mb-6"></div>
                <span className="text-[11px] font-black text-[#004071] uppercase tracking-[0.4em] animate-pulse">Analizando Infraestructura...</span>
              </div>
            )}
            {analysis.status === 'done' && analysis.result && (
              <div className="animate-in fade-in zoom-in-95 duration-500 w-full">
                <ResultDisplay
                  analysisId={analysis.id}
                  result={analysis.result}
                  searchTerm={searchTerm}
                  duplicateIds={duplicateIds}
                  onUpdateNode={(nodeId, updates) => onUpdateNode(analysis.id, nodeId, updates)}
                  onRemoveNode={(nodeId) => onRemoveNode(analysis.id, nodeId)}
                  onRemoveAnalysis={() => onRemove(analysis.id)}
                  onSaveToLibrary={onSaveToLibrary}
                  onProcess={onProcess}
                  onCopyNode={onCopyNode}
                  onAddNode={() => onAddNode(analysis.id)}
                  onExportTable={() => onExportTable && onExportTable(analysis.id)}
                  isManual={isManual}
                  project={activeProject}
                  catalogItems={catalogItems}
                />
              </div>
            )}
            {analysis.status === 'error' && (
              <div className="py-10 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <i className="fa-solid fa-circle-exclamation text-2xl"></i>
                </div>
                <h5 className="text-sm font-black text-red-600 uppercase tracking-widest">Error en Procesamiento</h5>
                <p className="text-xs text-slate-500 font-medium mt-1">{analysis.error || 'No se pudo interpretar el plano.'}</p>
                <button onClick={() => onProcess(analysis.id)} className="mt-6 text-[10px] font-black text-[#004071] uppercase underline">Reintentar</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
export default AnalysisCard;
