import React, { useState, useEffect, useMemo } from 'react';
import { AnalysisResult, HydraulicNode, Piece, NodeMaterial, Project } from '../types.ts';
import AuditReportModal from './AuditReportModal.tsx';

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

interface PieceRowProps {
  piece: Piece;
  onUpdate: (updates: Partial<Piece>) => void;
  onRemove: () => void;
}

const PieceRow: React.FC<PieceRowProps> = ({ piece, onUpdate, onRemove }) => {
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

interface NodeCardProps {
  node: HydraulicNode;
  index: number;
  onUpdate: (updates: Partial<HydraulicNode>) => void;
  onRemove: () => void;
  onSave: () => void;
  onCopy: () => void;
  isDuplicate: boolean;
}

const NodeCard: React.FC<NodeCardProps> = ({ node, index, onUpdate, onRemove, onSave, onCopy, isDuplicate }) => {
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editedName, setEditedName] = useState(node.nodeName);
  const [editedId, setEditedId] = useState(node.id);
  const [isEditingAnchorage, setIsEditingAnchorage] = useState(false);
  const [editedAnchorageCount, setEditedAnchorageCount] = useState(node.anchorageCount);

  const incompleteCount = node.pieces.filter(p => !p.name || !p.material || !p.diameter || p.quantity <= 0).length;
  const hasError = incompleteCount > 0 || isDuplicate;

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

  const formatIdsForDisplay = (idStr: string, type: string) => {
    const matches = idStr.match(/\d+/g);
    if (!matches) return idStr;
    
    const prefixMap: Record<string, string> = {
      'Corte': 'C',
      'Ventosa': 'V',
      'Desague': 'D',
      'Reductora': 'R',
      'Numerico': ''
    };
    
    const prefix = prefixMap[type] || '';
    
    return matches.map(m => {
      const num = parseInt(m, 10);
      return prefix ? `${prefix}-${num}` : m.padStart(2, '0');
    }).join(', ');
  };

  return (
    <div className={`bg-white border-2 rounded-[2rem] overflow-hidden mb-6 shadow-sm transition-all group w-full ${hasError ? 'border-amber-400' : 'border-[#88C13E]'}`}>
      <div className={`px-8 py-6 border-b flex justify-between items-center transition-colors ${hasError ? 'bg-amber-50/30' : 'bg-green-50/30 group-hover:bg-white'}`}>
        <div className="flex items-center gap-6 flex-grow">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg shadow-lg shrink-0 ${hasError ? 'bg-amber-500 text-white' : 'bg-[#88C13E] text-white'}`}>
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
                  {node.nodeName} <span className={`${isDuplicate ? 'text-amber-600' : 'text-[#88C13E]'} font-bold ml-1`}>({formatIdsForDisplay(node.id, node.type)})</span>
                </h4>
                {isDuplicate && <span className="bg-amber-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase ml-2 animate-pulse">ID Duplicado en {node.type}</span>}
                {incompleteCount > 0 && <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Revisar {incompleteCount} items</span>}
                
                {isEditingAnchorage ? (
                  <div className="ml-4 flex items-center gap-2">
                     <i className="fa-solid fa-cubes text-xs text-slate-400"></i>
                     <input
                       type="number"
                       value={editedAnchorageCount}
                       onChange={e => setEditedAnchorageCount(parseInt(e.target.value, 10) || 0)}
                       onBlur={handleSaveAnchorage}
                       onKeyDown={e => { if (e.key === 'Enter') handleSaveAnchorage(); if (e.key === 'Escape') setIsEditingAnchorage(false); }}
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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    audit: false,
    schemes: false,
    missing: false
  });
  const [nodesToReportMissing, setNodesToReportMissing] = useState(new Set<string>());

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleToggleMissingNodeReport = (nodeKey: string) => {
    setNodesToReportMissing(prev => {
        const newSet = new Set(prev);
        if (newSet.has(nodeKey)) {
            newSet.delete(nodeKey);
        } else {
            newSet.add(nodeKey);
        }
        return newSet;
    });
  };

  const handleToggleSelectAllMissingNodes = () => {
    if (nodesToReportMissing.size === missingNodes.length) {
      setNodesToReportMissing(new Set());
    } else {
      const allKeys = missingNodes.map(n => `${n.type}:${n.number}`);
      setNodesToReportMissing(new Set(allKeys));
    }
  };
  
  // Explicitly type filteredNodes as HydraulicNode[] to avoid inference issues.
  const filteredNodes = useMemo<HydraulicNode[]>(() => {
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
    const idsByType: Record<string, Set<number>> = {
      Numerico: new Set(),
      Corte: new Set(),
      Ventosa: new Set(),
      Desague: new Set(),
      Reductora: new Set()
    };

    result.nodes.forEach(node => {
      const type = node.type || 'Numerico';
      const matches = node.id.match(/\d+/g);
      if (matches) {
        matches.forEach(idStr => {
          const num = parseInt(idStr, 10);
          if (!isNaN(num)) {
            if (!idsByType[type]) idsByType[type] = new Set();
            idsByType[type].add(num);
          }
        });
      }
    });

    const missing: { type: string, number: number }[] = [];

    Object.entries(idsByType).forEach(([type, set]) => {
      if (set.size < 2) return;
      const sorted = Array.from(set).sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      for (let i = min; i <= max; i++) {
        if (!set.has(i)) {
          missing.push({ type, number: i });
        }
      }
    });

    return missing.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.number - b.number;
    });
  }, [result.nodes]);

  // Agrupamiento de nudos faltantes para el UI
  // Explicitly type missingNodesGrouped to ensure Object.entries works as expected.
  const missingNodesGrouped = useMemo<Record<string, { type: string, number: number }[]>>(() => {
    const groups: Record<string, { type: string, number: number }[]> = {};
    missingNodes.forEach(n => {
      if (!groups[n.type]) groups[n.type] = [];
      groups[n.type].push(n);
    });
    return groups;
  }, [missingNodes]);

  // Explicitly type unifiedNodesSummary as HydraulicNode[]
  const unifiedNodesSummary = useMemo<HydraulicNode[]>(() => {
    if (isManual) return [];
    return result.nodes
      .filter(node => node.sourceGroupings && node.sourceGroupings.length > 1);
  }, [result.nodes, isManual]);

  const isAnythingToReport = unifiedNodesSummary.length > 0 || missingNodes.length > 0;

  const getPrefixLabel = (type: string) => {
    const prefixMap: Record<string, string> = {
      'Corte': 'C',
      'Ventosa': 'V',
      'Desague': 'D',
      'Reductora': 'R',
      'Numerico': ''
    };
    return prefixMap[type] || '';
  };

  const getFullTypeLabel = (type: string) => {
    const labelMap: Record<string, string> = {
      'Corte': 'Cámaras de Corte',
      'Ventosa': 'Cámaras de Ventosa',
      'Desague': 'Cámaras de Desagüe',
      'Reductora': 'Válvulas Reductoras',
      'Numerico': 'Nudos Numéricos'
    };
    return labelMap[type] || type;
  };

  const formatIdsForDisplay = (idStr: string, type: string) => {
    const matches = idStr.match(/\d+/g);
    if (!matches) return idStr;
    const prefix = getPrefixLabel(type);
    return matches.map(m => {
      const num = parseInt(m, 10);
      return prefix ? `${prefix}-${num}` : m.padStart(2, '0');
    }).join(', ');
  };

  const selectedMissingNodesObjects = useMemo(() => {
    return missingNodes.filter(n => nodesToReportMissing.has(`${n.type}:${n.number}`));
  }, [missingNodes, nodesToReportMissing]);

  return (
    <div className="space-y-8 w-full">
      {isAnythingToReport && (
        <div className="bg-blue-50 border border-blue-200 rounded-[1.5rem] overflow-hidden shadow-sm animate-in slide-in-from-top-4 duration-500">
          <div 
            onClick={() => toggleSection('audit')}
            className="p-6 flex items-start gap-5 cursor-pointer hover:bg-blue-100/50 transition-colors"
          >
            <div className="w-12 h-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
              <i className="fa-solid fa-file-invoice text-xl"></i>
            </div>
            <div className="flex-grow">
              <h5 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-1 flex items-center justify-between">
                Auditoría Técnica y Reportes
                <i className={`fa-solid ${collapsedSections.audit ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
              </h5>
              {!collapsedSections.audit && (
                <>
                  <p className="text-xs text-blue-700 mb-4">
                    Se han identificado puntos de mejora. Genera una minuta técnica para comunicar estas observaciones al equipo de dibujo.
                  </p>
                  <ul className="list-disc list-inside text-xs text-blue-800 font-bold space-y-1">
                    {unifiedNodesSummary.length > 0 && <li>{unifiedNodesSummary.length} esquema(s) repetido(s) para unificar.</li>}
                    {missingNodes.length > 0 && <li>{missingNodes.length} nudo(s) faltante(s) detectados.</li>}
                  </ul>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowAuditReportModal(true); }}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-xl text-[9px] font-black uppercase hover:shadow-lg transition-all self-start"
                  >
                    <i className="fa-solid fa-file-pdf mr-2"></i> Generar Minuta
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {unifiedNodesSummary.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-[1.5rem] overflow-hidden shadow-sm animate-in fade-in duration-500">
          <div 
            onClick={() => toggleSection('schemes')}
            className="p-6 flex items-start gap-5 cursor-pointer hover:bg-green-100/50 transition-colors"
          >
            <div className="w-12 h-12 bg-green-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-green-500/20">
              <i className="fa-solid fa-object-group text-xl"></i>
            </div>
            <div className="flex-grow">
              <h5 className="text-[11px] font-black text-green-900 uppercase tracking-widest mb-2 flex items-center justify-between">
                Observación: Esquemas Repetidos Detectados
                <i className={`fa-solid ${collapsedSections.schemes ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
              </h5>
              {!collapsedSections.schemes && (
                <div className="space-y-1.5 mt-2">
                  {unifiedNodesSummary.map((node, index) => (
                    <p key={index} className="text-[10px] text-green-700 font-bold uppercase opacity-90 leading-relaxed">
                      Para <span className="text-green-900 font-black">"{node.nodeName}"</span>, se detectaron dibujos idénticos para <span className="text-green-900 font-black">{formatIdsForDisplay((node.sourceGroupings || [])[0], node.type)}</span> y {(node.sourceGroupings || []).slice(1).map((group, i) => (
                          <span key={i}>
                              <span className="text-green-900 font-black">{formatIdsForDisplay(group as string, node.type)}</span>{i < (node.sourceGroupings?.length || 0) - 2 ? ' y ' : ''}
                          </span>
                      ))}.
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {missingNodes.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-[1.5rem] overflow-hidden shadow-sm">
          <div 
            onClick={() => toggleSection('missing')}
            className="p-6 flex items-start gap-5 cursor-pointer hover:bg-sky-100/50 transition-colors"
          >
            <div className="w-12 h-12 bg-sky-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/20">
              <i className="fa-solid fa-search-plus text-xl"></i>
            </div>
            <div className="flex-grow">
              <h5 className="text-[11px] font-black text-sky-900 uppercase tracking-widest mb-2 flex items-center justify-between">
                Observación: Nudos Faltantes por Categoría
                <i className={`fa-solid ${collapsedSections.missing ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
              </h5>
              {!collapsedSections.missing && (
                <>
                  <p className="text-xs text-sky-700 mb-4 uppercase font-bold opacity-70">Evaluación de secuencias correlativas de forma aislada:</p>
                  <div className="mb-6">
                    <label 
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-sky-300 rounded-lg cursor-pointer hover:bg-sky-100 transition-colors font-black text-sky-900 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={nodesToReportMissing.size === missingNodes.length}
                        ref={el => { if(el) el.indeterminate = nodesToReportMissing.size > 0 && nodesToReportMissing.size < missingNodes.length; }}
                        onChange={(e) => { e.stopPropagation(); handleToggleSelectAllMissingNodes(); }}
                        className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                      MARCAR TODOS
                    </label>
                  </div>
                  
                  <div className="space-y-6">
                    {(Object.entries(missingNodesGrouped) as [string, { type: string, number: number }[]][]).map(([type, nodes]) => (
                      <div key={type} className="space-y-2">
                        <h6 className="text-[9px] font-black text-sky-900 uppercase tracking-widest border-b border-sky-200 pb-1">{getFullTypeLabel(type)}:</h6>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {nodes.map(n => {
                            const nodeKey = `${n.type}:${n.number}`;
                            const prefix = getPrefixLabel(n.type);
                            const label = prefix ? `${prefix}-${n.number}` : String(n.number).padStart(2, '0');
                            return (
                              <label 
                                key={nodeKey} 
                                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-sky-200 rounded-lg cursor-pointer hover:bg-sky-200 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={nodesToReportMissing.has(nodeKey)}
                                  onChange={(e) => { e.stopPropagation(); handleToggleMissingNodeReport(nodeKey); }}
                                  className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                />
                                <span className="text-[10px] font-black text-sky-800 uppercase tracking-tighter">ID {label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
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
              Se han detectado componentes con datos incompletos. <br/>
              <span className="text-amber-900">Por favor, revisa las filas resaltadas en color ámbar en el detalle de cada nudo.</span>
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
          const nodeNumericIds: string[] = node.id.match(/\d+/g) || [];
          const isDuplicate = nodeNumericIds.some(id => duplicateIds.has(`${node.type}:${id.toLowerCase()}`));
          
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
            missingNodes={selectedMissingNodesObjects}
            onClose={() => setShowAuditReportModal(false)}
        />
      )}
    </div>
  );
};

export default ResultDisplay;
