
import React, { useState, useEffect, useMemo } from 'react';
// Fix: Added missing FileAnalysis type import.
import { AnalysisResult, HydraulicNode, Piece, NodeMaterial, FileAnalysis, Project } from '../types.ts';
import ResultDisplay from './ResultDisplay.tsx';

interface AnalysisCardProps {
  analysis: FileAnalysis;
  onProcess: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateNode: (analysisId: string, nodeId: string, updates: Partial<HydraulicNode>) => void;
  onRemoveNode: (analysisId: string, nodeId: string) => void;
  onSaveToLibrary: (node: HydraulicNode) => void;
  searchTerm: string;
  duplicateIds: Set<string>;
  credits: number;
  onCopyNode: (node: HydraulicNode) => void;
  activeProject?: Project;
}

const AnalysisCard: React.FC<AnalysisCardProps> = ({ analysis, onProcess, onRemove, onUpdateNode, onRemoveNode, onSaveToLibrary, searchTerm, duplicateIds, credits, onCopyNode, activeProject }) => {
  const isManual = !analysis.image;

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col transition-all hover:border-[#88C13E] group w-full mb-10">
      {analysis.image && (
        <div className="relative h-28 bg-[#0f172a] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, #88C13E 25%, transparent 25%, transparent 50%, #88C13E 50%, #88C13E 75%, transparent 75%, transparent)', backgroundSize: '20px 20px' }}></div>
          <div className="flex flex-col items-center gap-2">
            <i className="fa-solid fa-file-invoice text-[#88C13E]/60 text-3xl"></i>
            <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Plano en Memoria de Análisis</span>
          </div>
          <div className="absolute top-4 right-6 flex items-center gap-3 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(analysis.id); }}
              className="bg-red-500/90 hover:bg-red-600 text-white w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-xl active:scale-90"
            >
              <i className="fa-solid fa-trash-can text-[10px]"></i>
            </button>
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
              isManual={isManual}
              project={activeProject}
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
    </div>
  );
};
export default AnalysisCard;