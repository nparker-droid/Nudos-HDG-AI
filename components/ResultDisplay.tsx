import React, { useState, useEffect, useMemo } from 'react';
import { AnalysisResult, HydraulicNode, Piece, NodeMaterial, Project } from '../types';
import AuditReportModal from './AuditReportModal';

interface ResultDisplayProps {
  analysisId: string;
  result: AnalysisResult;
  searchTerm: string;
  duplicateIds: Set<string>;
  onUpdateNode: (nodeId: string, updates: Partial<HydraulicNode>) => void;
  onRemoveNode: (nodeId: string) => void;
  onRemoveAnalysis: () => void;
  onSaveToLibrary: (node: HydraulicNode) => void;
  onProcess: (analysisId: string) => void;
  onCopyNode: (node: HydraulicNode) => void;
  isManual: boolean;
  project?: Project;
}

const PieceRow: React.FC<{ piece: Piece, onUpdate: (updates: Partial<Piece>) => void, onRemove: () => void }> = ({ piece, onUpdate, onRemove }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localWeight, setLocalWeight] = useState(piece.weight !== undefined ? piece.weight.toString().replace('.', ',') : '');

  const isIncomplete = !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0;

  useEffect(() => {
    const parentWeightStr = piece.weight !== undefined ? piece.weight.toString().replace('.', ',') : '';
    if (parseFloat(localWeight.replace(',', '.')) !== piece.weight) {
      setLocalWeight(parentWeightStr);
    }
  }, [piece.weight]);

  const handleWeightChange = (val: string) => {
    let maskedVal = val.replace(/\./g, ',');
    const parts = maskedVal.split(',');
    if (parts.length > 2) maskedVal = parts[0] + ',' + parts.slice(1).join('');
    setLocalWeight(maskedVal);
    const floatVal = parseFloat(maskedVal.replace(',', '.'));
    onUpdate({ weight: isNaN(floatVal) ? 0 : floatVal });
  };

  return (
    <tr className={`transition-colors group/row ${isIncomplete ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {isIncomplete && <i className="fa-solid fa-circle-question text-amber-500 text-xs" title="Item a revisar"></i>}
          {isEditing ? (
            <input type="text" value={piece.name} onChange={e => onUpdate({ name: e.target.value })} className="bg-white border rounded px-2 py-1 w-full font-bold text-slate-700" onBlur={() => setIsEditing(false)} autoFocus />
          ) : (
            <span className={`font-bold text-slate-700 cursor-pointer ${!piece.name ? 'text-slate-300 italic underline decoration-dotted' : ''}`} onClick={() => setIsEditing(true)}>
              {piece.name || 'Definir pieza...'}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <select value={piece.material} onChange={e => onUpdate({ material: e.target.value as NodeMaterial })} className={`text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest outline-none border-none ${!piece.material ? 'bg-amber-200 text-amber-900' : 'bg-slate-100'}`}>
          <option value="">?</option>
          {Object.values(NodeMaterial).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </td>
      <td className="px-6 py-4 text-center">
        <input type="text" placeholder="DN?" value={piece.diameter} onChange={e => onUpdate({ diameter: e.target.value })} className={`bg-transparent border-none text-center font-mono font-black text-[#004071] w-20 outline-none ${!piece.diameter ? 'placeholder:text-amber-500' : ''}`} />
      </td>
      <td className="px-6 py-4 text-center">
        <input type="text" placeholder="0,00" value={localWeight} onChange={e => handleWeightChange(e.target.value)} className="bg-transparent border-none text-center font-mono text-[11px] text-slate-500 w-16 outline-none" />
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-4">
          <input type="number" value={piece.quantity} onChange={e => onUpdate({ quantity: parseInt(e.target.value) || 0 })} className={`bg-transparent border-none text-right font-black w-12 outline-none text-base ${piece.quantity <= 0 ? 'text-amber-600' : 'text-[#004071]'}`} />
          <button onClick={onRemove} className="opacity-0 group-hover/row:opacity-100 text-red-300 hover:text-red-500 transition-opacity"><i className="fa-solid fa-trash text-[10px]"></i></button>
        </div>
      </td>
    </tr>
  );
};

const NodeCard: React.FC<{ node: HydraulicNode, index: number, onUpdate: (updates: Partial<HydraulicNode>) => void, onRemove: () => void, onSave: () => void, onCopy: () => void, isDuplicate: boolean }> = ({ node, index, onUpdate, onRemove, onSave, onCopy, isDuplicate }) => {
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editedName, setEditedName] = useState(node.nodeName);
  const [editedId, setEditedId] = useState(node.id);
  const [isEditingAnchorage, setIsEditingAnchorage] = useState(false);
  const [editedAnchorageCount, setEditedAnchorageCount] = useState(node.anchorageCount);

  const incompleteCount = node.pieces.filter(p => !p.name || !p.material || !p.diameter || p.quantity <= 0).length;

  const handleSaveHeader = () => {
    onUpdate({ nodeName: editedName, id: editedId });
    setIsEditingHeader(false);
  };

  const handleUpdatePiece = (idx: number, updates: Partial<Piece>) => {
    const newPieces = [...node.pieces];
    newPieces[idx] = { ...newPieces[idx], ...updates };
    onUpdate({ pieces: newPieces });
  };

  const handleAddPiece = () => {
    onUpdate({ pieces: [...node.pieces, { name: '', material: NodeMaterial.Otro, diameter: '', quantity: 1, union: '', weight: 0 }] });
  };

  const handleRemovePiece = (idx: number) => {
    onUpdate({ pieces: node.pieces.filter((_, i) => i !== idx) });
  };
  
  const handleEditAnchorage = () => {
    setEditedAnchorageCount(node.anchorageCount || 0);
    setIsEditingAnchorage(true);
  };
  
  const handleSaveAnchorage = () => {
    onUpdate({ anchorageCount: editedAnchorageCount });
    setIsEditingAnchorage(false);
  };

  const handleCancelAnchorageEdit = () => {
    setIsEditingAnchorage(false);
  };


  return (
    <div className={`bg-white border-2 rounded-[2rem] overflow-hidden mb-6 shadow-sm transition-all group w-full ${isDuplicate ? 'border-amber-400' : incompleteCount > 0 ? 'border-amber-200' : 'border-slate-100 hover:border-[#88C13E]'}`}>
      <div className={`px-8 py-6 border-b flex justify-between items-center transition-colors ${incompleteCount > 0 ? 'bg-amber-50/30' : 'bg-slate-50/50 group-hover:bg-white'}`}>
        <div className="flex items-center gap-6 flex-grow">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg shadow-lg shrink-0 ${incompleteCount > 0 ? 'bg-amber-500 text-white' : 'bg-[#004071] text-[#D9E021]'}`}>
            {index + 1}
          </div>
          <div className="flex flex-col flex-grow">
            {isEditingHeader ? (
              <div className="flex items-center gap-3">
                <input type="text" value={editedName} onChange={e => setEditedName(e.target.value)} className="bg-white border rounded-lg px-3 py-1 text-sm font-black text-[#004071]" />
                <input type="text" value={editedId} onChange={e => setEditedId(e.target.value)} className="bg-white border rounded-lg px-3 py-1 text-xs font-bold text-[#88C13E] w-32" />
                <button onClick={handleSaveHeader} className="bg-[#88C13E] text-white p-2 rounded-lg"><i className="fa-solid fa-check text-[10px]"></i></button>
              </div>
            ) : (
              <div className="flex items-center group/title gap-2">
                <h4 className="text-base font-black text-[#004071] uppercase tracking-tighter cursor-pointer" onClick={() => setIsEditingHeader(true)}>
                  {node.nodeName} <span className={`${incompleteCount > 0 ? 'text-amber-600' : 'text-[#88C13E]'} font-bold ml-1`}>({node.id})</span>
                </h4>
                {incompleteCount > 0 && <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Revisar {incompleteCount} items</span>}
                
                {isEditingAnchorage ? (
                  <div className="ml-4 flex items-center gap-2">
                     <i className="fa-solid fa-cubes text-xs text-slate-400"></i>
                     <input
                       type="number"
                       value={editedAnchorageCount}
                       onChange={e => setEditedAnchorageCount(parseInt(e.target.value, 10) || 0)}
                       onBlur={handleSaveAnchorage}
                       onKeyDown={e => { if (e.key === 'Enter') handleSaveAnchorage(); if (e.key === 'Escape') handleCancelAnchorageEdit(); }}
                       className="w-16 bg-white border border-[#88C13E] rounded-lg px-2 py-0.5 text-center font-black text-[#004071]"
                       autoFocus
                     />
                  </div>
                ) : (
                   <div 
                     onClick={handleEditAnchorage}
                     className="ml-4 flex items-center gap-2 bg-slate-100 text-slate-500 text-[9px] font-black px-2.5 py-1 rounded-full cursor-pointer hover:bg-slate-200"
                     title="Editar anclajes">
                     <i className="fa-solid fa-cubes text-xs"></i>
                     ANCLAJES x {node.anchorageCount || 0}
                   </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={onSave} className="px-4 py-2 bg-slate-100 text-[#004071] rounded-xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all" title="Guardar en Biblioteca"><i className="fa-solid fa-bookmark mr-2"></i>Biblioteca</button>
            <button onClick={onCopy} className="px-4 py-2 bg-slate-100 text-[#004071] rounded-xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all" title="Copiar Nudo"><i className="fa-solid fa-copy mr-2"></i>Copiar</button>
            <button onClick={handleAddPiece} className="px-4 py-2 bg-[#88C13E] text-white rounded-xl text-[9px] font-black uppercase hover:shadow-lg transition-all"><i className="fa-solid fa-plus mr-2"></i>Pieza</button>
        </div>
      </div>
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#f8fafc] text-slate-400 uppercase text-[9px] tracking-[0.2em]">
            <tr>
              <th className="px-6 py-5 font-black">Pieza</th>
              <th className="px-6 py-5 font-black text-center">Mat.</th>
              <th className="px-6 py-5 font-black text-center">Diám.</th>
              <th className="px-6 py-5 font-black text-center">Peso(kg)</th>
              <th className="px-6 py-5 font-black text-right pr-12">Cant.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {node.pieces.map((piece, idx) => (
              <PieceRow key={idx} piece={piece} onUpdate={u => handleUpdatePiece(idx, u)} onRemove={() => handleRemovePiece(idx)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ResultDisplay: React.FC<ResultDisplayProps> = ({ analysisId, result, searchTerm, duplicateIds, onUpdateNode, onRemoveNode, onRemoveAnalysis, onSaveToLibrary, onProcess, onCopyNode, isManual, project }) => {
  const [showAuditReportModal, setShowAuditReportModal] = useState(false);
  const [nodesToReportMissing, setNodesToReportMissing] = useState(new Set<number>());

  const handleToggleMissingNodeReport = (nodeId: number) => {
    setNodesToReportMissing(prev => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
            newSet.delete(nodeId);
        } else {
            newSet.add(nodeId);
        }
        return newSet;
    });
  };

  const handleToggleSelectAllMissingNodes = () => {
    if (nodesToReportMissing.size === missingNodes.length) {
      setNodesToReportMissing(new Set());
    } else {
      setNodesToReportMissing(new Set(missingNodes));
    }
  };
  
  const filteredNodes = useMemo(() => {
    let nodes = [...result.nodes];
    nodes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    if (!searchTerm) return nodes;
    const lower = searchTerm.toLowerCase();
    return nodes.filter(n => n.nodeName.toLowerCase().includes(lower) || n.id.toLowerCase().includes(lower));
  }, [result.nodes, searchTerm]);

  const totalIncomplete = useMemo(() => {
    return filteredNodes.reduce((acc, node) => {
      return acc + node.pieces.filter(p => !p.name || !p.material || !p.diameter || p.quantity <= 0).length;
    }, 0);
  }, [filteredNodes]);

  const missingNodes = useMemo(() => {
    const allIds = new Set<number>();
    result.nodes.forEach(node => {
      node.id.split(',').forEach(idStr => {
        const num = parseInt(idStr.trim(), 10);
        if (!isNaN(num)) {
          allIds.add(num);
        }
      });
    });

    if (allIds.size < 2) return [];

    const sortedIds = Array.from(allIds).sort((a, b) => a - b);
    const minId = sortedIds[0];
    const maxId = sortedIds[sortedIds.length - 1];
    const missing: number[] = [];

    for (let i = minId; i <= maxId; i++) {
      if (!allIds.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }, [result.nodes]);

  const unifiedNodesSummary = useMemo(() => {
    if (isManual) return [];
    return result.nodes
      .filter(node => node.sourceGroupings && node.sourceGroupings.length > 1);
  }, [result.nodes, isManual]);

  const isAnythingToReport = unifiedNodesSummary.length > 0 || missingNodes.length > 0;

  return (
    <div className="space-y-8 w-full">
      {isAnythingToReport && (
        <div className="bg-blue-50 border border-blue-200 rounded-[1.5rem] p-6 animate-in slide-in-from-top-4 duration-500 shadow-sm">
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
              <i className="fa-solid fa-file-invoice text-xl"></i>
            </div>
            <div className="flex-grow">
              <h5 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-2">Auditoría Técnica y Reportes</h5>
              <p className="text-xs text-blue-700 mb-4">
                Se han identificado puntos de mejora en los planos. Genera una minuta técnica para comunicar estas observaciones al equipo de dibujo.
              </p>
              <ul className="list-disc list-inside text-xs text-blue-800 font-bold space-y-1">
                {unifiedNodesSummary.length > 0 && <li>{unifiedNodesSummary.length} esquema(s) repetido(s) para unificar.</li>}
                {missingNodes.length > 0 && <li>{missingNodes.length} nudo(s) faltante(s) en la secuencia (para verificar).</li>}
              </ul>
            </div>
            <button
              onClick={() => setShowAuditReportModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-[9px] font-black uppercase hover:shadow-lg transition-all self-start"
            >
              <i className="fa-solid fa-file-pdf mr-2"></i> Generar Minuta
            </button>
          </div>
        </div>
      )}

      {unifiedNodesSummary.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-[1.5rem] p-6 animate-in slide-in-from-top-4 duration-500 shadow-sm">
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 bg-green-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-green-500/20">
              <i className="fa-solid fa-object-group text-xl"></i>
            </div>
            <div className="flex-grow">
              <h5 className="text-[11px] font-black text-green-900 uppercase tracking-widest mb-2">Observación: Esquemas Repetidos</h5>
              <div className="space-y-1.5">
                {unifiedNodesSummary.map((node, index) => (
                   <p key={index} className="text-[10px] text-green-700 font-bold uppercase leading-relaxed opacity-90">
                     Para <span className="text-green-900 font-black">"{node.nodeName}"</span>, se unificó el esquema que contenía los nudos <span className="text-green-900 font-black">{node.sourceGroupings![0]}</span> y {node.sourceGroupings!.slice(1).map((group, i) => (
                        <span key={i}>
                            otro que contenía <span className="text-green-900 font-black">{group}</span>{i < node.sourceGroupings!.length - 2 ? ' y ' : ''}
                        </span>
                    ))}.
                   </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {missingNodes.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-[1.5rem] p-6 animate-in slide-in-from-top-4 duration-500 shadow-sm">
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 bg-sky-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/20">
              <i className="fa-solid fa-search-plus text-xl"></i>
            </div>
            <div className="flex-grow">
              <h5 className="text-[11px] font-black text-sky-900 uppercase tracking-widest mb-2">Observación: Nudos Faltantes en Secuencia</h5>
              <p className="text-xs text-sky-700 mb-4">
                Selecciona los nudos que, tras tu verificación, realmente falten en el plano para incluirlos en la minuta.
              </p>
              <div className="mb-4">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-sky-300 rounded-lg cursor-pointer hover:bg-sky-100 transition-colors font-black text-sky-900 text-xs">
                  <input
                    type="checkbox"
                    checked={nodesToReportMissing.size === missingNodes.length}
                    ref={el => { if(el) el.indeterminate = nodesToReportMissing.size > 0 && nodesToReportMissing.size < missingNodes.length; }}
                    onChange={handleToggleSelectAllMissingNodes}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  MARCAR TODOS
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {missingNodes.map(nodeId => (
                  <label key={nodeId} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-sky-200 rounded-lg cursor-pointer hover:bg-sky-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={nodesToReportMissing.has(nodeId)}
                      onChange={() => handleToggleMissingNodeReport(nodeId)}
                      className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-xs font-bold text-sky-800">NUDO {String(nodeId).padStart(2, '0')}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {totalIncomplete > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[1.5rem] p-6 flex items-start gap-5 animate-in slide-in-from-top-4 duration-500 shadow-sm">
          <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <i className="fa-solid fa-list-check text-xl"></i>
          </div>
          <div>
            <h5 className="text-[11px] font-black text-amber-900 uppercase tracking-widest mb-1">Items a revisar por el usuario: {totalIncomplete}</h5>
            <p className="text-[10px] text-amber-700 font-bold uppercase leading-relaxed opacity-80">
              Se han detectado componentes pero no fue posible completar todos sus datos (Nombre, Material o Diámetro). <br/>
              <span className="text-amber-900">Por favor, revisa las filas resaltadas en color ámbar.</span>
            </p>
          </div>
        </div>
      )}

      <div className="bg-[#004071] p-6 rounded-[1.5rem] shadow-xl flex justify-between items-center text-white">
        <div>
          <h5 className="text-[10px] font-black text-[#D9E021] uppercase tracking-[0.4em] mb-1">
            {isManual ? 'NUDO REGISTRADO MANUALMENTE' : 'REPORTE TÉCNICO'}
          </h5>
          <p className="text-slate-200 text-xs italic">"{result.summary}"</p>
        </div>
        <div className="flex items-center gap-2">
          {!isManual && (
            <button 
              onClick={() => onProcess(analysisId)} 
              className="text-white/60 hover:text-white p-2 transition-colors"
              title="Re-analizar"
            >
              <i className="fa-solid fa-sync-alt"></i>
            </button>
          )}
          <button 
            onClick={onRemoveAnalysis} 
            className="text-white/30 hover:text-red-400 p-2 transition-colors"
            title="Eliminar análisis"
          >
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <div className="w-full">
        {filteredNodes.map((node, idx) => {
          const ids = node.id.split(',').map(s => s.trim().toLowerCase());
          const isDuplicate = ids.some(id => duplicateIds.has(id));
          return (
            <NodeCard 
              key={`${node.id}-${idx}`} 
              node={node} 
              index={idx} 
              isDuplicate={isDuplicate}
              onUpdate={u => onUpdateNode(node.id, u)} 
              onRemove={() => onRemoveNode(node.id)} 
              onSave={() => onSaveToLibrary(node)}
              onCopy={() => onCopyNode(node)}
            />
          );
        })}
      </div>
      {showAuditReportModal && project && (
        <AuditReportModal 
            project={project}
            repeatedNodes={unifiedNodesSummary}
            // Fix: Explicitly type sort parameters to resolve a TypeScript type inference error.
            missingNodes={Array.from(nodesToReportMissing).sort((a: number,b: number) => a - b)}
            onClose={() => setShowAuditReportModal(false)}
        />
      )}
    </div>
  );
};

export default ResultDisplay;