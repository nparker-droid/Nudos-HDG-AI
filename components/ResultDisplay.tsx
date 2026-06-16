import React, { useState, useEffect, useMemo } from 'react';
import { AnalysisResult, HydraulicNode, Piece, NodeMaterial, Project, CatalogItem } from '../types.ts';
import { findInCatalog } from '../services/catalogService.ts';
import { normalizeText } from '../utils/normalization.ts';

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
  onAddNode: () => void;
  onExportTable?: () => void;
  catalogItems: CatalogItem[];
}

interface PieceRowProps {
  piece: Piece;
  onUpdate: (updates: Partial<Piece>) => void;
  onRemove: () => void;
  catalogItems: CatalogItem[];
}

const PieceRow: React.FC<PieceRowProps> = ({ piece, onUpdate, onRemove, catalogItems }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localWeight, setLocalWeight] = useState(piece.weight !== undefined ? piece.weight.toString().replace('.', ',') : '');
  const [localPrice, setLocalPrice] = useState(piece.price !== undefined ? piece.price.toString() : '');

  const isIncomplete = !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0;
  const inferredUnionCount = piece.unionCount ?? (piece.name && !/(union|brida|flange|junta|perno|tubo|caner|caner|hormig|anclaje)/i.test(piece.name) ? 2 : 0);

  useEffect(() => {
    const parentWeightStr = piece.weight !== undefined ? piece.weight.toString().replace('.', ',') : '';
    if (parseFloat(localWeight.replace(',', '.')) !== piece.weight) {
      setLocalWeight(parentWeightStr);
    }
  }, [piece.weight]);

  useEffect(() => {
    const parentPriceStr = piece.price !== undefined ? piece.price.toString() : '';
    if (parseInt(localPrice) !== piece.price) {
      setLocalPrice(parentPriceStr);
    }
  }, [piece.price]);

  const handleWeightChange = (val: string) => {
    let maskedVal = val.replace(/\./g, ',');
    const parts = maskedVal.split(',');
    if (parts.length > 2) maskedVal = parts[0] + ',' + parts.slice(1).join('');
    setLocalWeight(maskedVal);
    const floatVal = parseFloat(maskedVal.replace(',', '.'));
    onUpdate({ weight: isNaN(floatVal) ? 0 : floatVal });
  };

  const handlePriceChange = (val: string) => {
    setLocalPrice(val);
    const num = parseInt(val.replace(/\D/g, ''));
    onUpdate({ price: isNaN(num) ? undefined : num });
  };

  const attemptCatalogMatch = () => {
    if (!catalogItems || catalogItems.length === 0) {
      alert('El catálogo está vacío. Importa el archivo BD_OPTIMIZADA_NUDOS desde el botón "Catálogo".');
      return;
    }
    if (!piece.name || !piece.diameter || !piece.material) {
      alert('La pieza debe tener Nombre, Material y Diámetro para buscar en el catálogo.');
      return;
    }
    const match = findInCatalog(piece.name, piece.diameter, piece.material, catalogItems);
    if (match.weight !== null) {
      onUpdate({ weight: match.weight, price: match.price ?? undefined });
    } else {
      alert(`No se encontró en el catálogo:\n"${piece.name} ${piece.material} ${piece.diameter}"`);
    }
  };

  return (
    <tr className={`transition-colors group/row ${isIncomplete ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {isIncomplete && <i className="fa-solid fa-circle-question text-amber-500 text-xs" title="Item a revisar"></i>}
          {isEditing ? (
            <input
              type="text"
              value={piece.name}
              onChange={e => onUpdate({ name: e.target.value.toUpperCase() })}
              className="bg-white border rounded px-2 py-1 w-full font-bold text-slate-700"
              onBlur={() => {
                if (piece.name) onUpdate({ name: piece.name.trim().toUpperCase() });
                setIsEditing(false);
              }}
              list="shared-piece-suggestions"
              autoFocus
            />
          ) : (
            <span className={`font-bold text-slate-700 cursor-pointer ${!piece.name ? 'text-slate-300 italic underline decoration-dotted' : ''}`} onClick={() => setIsEditing(true)}>
              {piece.name || 'Definir pieza...'}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <select value={piece.material} onChange={e => onUpdate({ material: e.target.value as NodeMaterial })} className={`w-full text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest outline-none border-none ${!piece.material ? 'bg-amber-200 text-amber-900' : 'bg-slate-100'}`}>
          <option value="">?</option>
          {Object.values(NodeMaterial).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </td>
      <td className="px-6 py-4 text-center">
        <input
          type="text"
          placeholder='Ej: 3", 75mm, 160mm'
          value={piece.diameter}
          onChange={e => onUpdate({ diameter: e.target.value })}
          className={`bg-transparent border-none text-center font-mono font-black text-[#004071] w-full outline-none placeholder:text-[9px] placeholder:font-normal placeholder:opacity-50 ${!piece.diameter ? 'placeholder:text-amber-500' : ''}`}
        />
      </td>
      <td className="px-6 py-4 text-center group/weight relative">
        <input type="text" placeholder="0,00" value={localWeight} onChange={e => handleWeightChange(e.target.value)} className="bg-transparent border-none text-center font-mono text-[11px] text-slate-500 w-full outline-none" />
        <button
          onClick={attemptCatalogMatch}
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/weight:opacity-100 transition-opacity bg-[#004071] text-[#D9E021] rounded-full w-5 h-5 flex items-center justify-center shadow-lg hover:scale-110"
          title="Buscar peso y precio en catálogo"
        >
          <i className="fa-solid fa-book-open text-[8px]"></i>
        </button>
      </td>
      <td className="px-4 py-4 text-center">
        <input
          type="text"
          placeholder="—"
          value={localPrice}
          onChange={e => handlePriceChange(e.target.value)}
          className="bg-transparent border-none text-center font-mono text-[11px] text-[#004071] w-full outline-none"
          title="Precio unitario CLP sin IVA"
        />
      </td>
      <td className="px-6 py-4 text-right">
        <input type="number" value={piece.quantity} onChange={e => onUpdate({ quantity: parseInt(e.target.value) || 0 })} className={`bg-transparent border-none text-right font-black w-full outline-none text-base ${piece.quantity <= 0 ? 'text-amber-600' : 'text-[#004071]'}`} />
      </td>
      <td className="px-6 py-4 text-center">
        <input
          type="checkbox"
          checked={!!piece.hasMechanism}
          onChange={e => onUpdate({ hasMechanism: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-[#004071]"
          title="Pieza con mecanismo"
        />
      </td>
      <td className="px-6 py-4 text-center">
        <div className="flex items-center justify-center gap-3">
          <input
            type="number"
            min={0}
            value={inferredUnionCount}
            onChange={e => onUpdate({ unionCount: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            className="w-14 bg-slate-50 border border-slate-100 rounded text-center text-[11px] text-[#004071] font-black"
          />
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
  onDelete: () => void;
  catalogItems: CatalogItem[];
}

const NodeCard: React.FC<NodeCardProps> = ({ node, index, onUpdate, onRemove, onSave, onCopy, isDuplicate, onDelete, catalogItems }) => {
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editedName, setEditedName] = useState(node.nodeName);
  const [editedId, setEditedId] = useState(node.id);
  const [isEditingAnchorage, setIsEditingAnchorage] = useState(false);
  const [editedAnchorageCount, setEditedAnchorageCount] = useState(node.anchorageCount);

  const incompleteCount = node.pieces.filter(p => !p.name || !p.material || !p.diameter || p.quantity <= 0).length;
  const hasError = incompleteCount > 0 || isDuplicate;

  const normalizeIdString = (val: string) => {
    return val.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => {
        // Normalización inteligente: si es un número puro o un prefijo+número (ej C-1)
        return s.replace(/(\d+)/, (match) => match.padStart(2, '0'));
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .join(', ');
  };

  const handleSaveHeader = () => {
    onUpdate({
      nodeName: editedName.toUpperCase(),
      id: normalizeIdString(editedId)
    });
    setIsEditingHeader(false);
  };

  const handleUpdatePiece = (idx: number, updates: Partial<Piece>) => {
    const newPieces = [...node.pieces];
    const updatedPiece = { ...newPieces[idx], ...updates };
    if (updates.name && updates.hasMechanism === undefined) {
      updatedPiece.hasMechanism = /valvula|válvula|ventosa|reductora|autobloqueante|hidrante|grifo/i.test(updatedPiece.name);
    }
    if ((updates.name || updates.material) && updates.unionCount === undefined) {
      updatedPiece.unionCount = /union|unión|brida|flange|junta|perno|tubo|cañer|hormig|anclaje/i.test(updatedPiece.name) ? 0 : 2;
    }

    // Auto-buscar peso y precio cuando cambia nombre, diámetro o material
    if ((updates.name || updates.diameter || updates.material) && !updates.weight) {
      const match = findInCatalog(updatedPiece.name, updatedPiece.diameter, updatedPiece.material, catalogItems);
      if (match.weight !== null) updatedPiece.weight = match.weight;
      if (match.price !== null) updatedPiece.price = match.price ?? undefined;
    }

    newPieces[idx] = updatedPiece;
    onUpdate({ pieces: newPieces });
  };

  const handleAddPiece = () => {
    onUpdate({ pieces: [...node.pieces, { name: '', material: NodeMaterial.Otro, diameter: '', quantity: 1, union: '', unionCount: 0, hasMechanism: false, weight: 0 }] });
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
    return idStr;
  };

  return (
    <div className={`bg-white border-2 rounded-[2rem] overflow-hidden mb-6 shadow-sm transition-all group w-full ${hasError ? 'border-amber-400' : 'border-[#88C13E]'}`}>
      <div className={`px-8 py-6 border-b flex justify-between items-center transition-colors ${hasError ? 'bg-amber-50/30' : 'bg-green-50/30 group-hover:bg-white'}`}>
        <div className="flex items-center gap-6 flex-grow">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg shadow-lg shrink-0 ${hasError ? 'bg-amber-500 text-white' : node.isManual ? 'bg-purple-600 text-white' : 'bg-[#88C13E] text-white'}`}>
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
          <button onClick={onSave} className="w-9 h-9 bg-slate-100 text-[#004071] rounded-xl hover:bg-slate-200 transition-all" title="Guardar en biblioteca"><i className="fa-solid fa-bookmark text-[11px]"></i></button>
          <button onClick={onCopy} className="w-9 h-9 bg-slate-100 text-[#004071] rounded-xl hover:bg-slate-200 transition-all" title="Copiar nudo"><i className="fa-solid fa-copy text-[11px]"></i></button>
          <button onClick={onDelete} className="w-9 h-9 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all" title="Eliminar nudo"><i className="fa-solid fa-trash text-[11px]"></i></button>
          <button onClick={handleAddPiece} className="px-4 py-2 bg-[#88C13E] text-white rounded-xl text-[9px] font-black uppercase hover:shadow-lg transition-all"><i className="fa-solid fa-plus mr-2"></i>Pieza</button>
        </div>
      </div>
      <div className="overflow-x-auto w-full">
        <table className="w-full table-fixed text-left text-[13px]">
          <colgroup>
            <col className="w-[27%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead className="bg-[#f8fafc] text-slate-400 uppercase text-[9px] tracking-[0.2em]">
            <tr>
              <th className="px-6 py-5 font-black">Pieza</th>
              <th className="px-6 py-5 font-black text-center">Mat.</th>
              <th className="px-6 py-5 font-black text-center">Diam.</th>
              <th className="px-6 py-5 font-black text-center">Peso(kg)</th>
              <th className="px-6 py-5 font-black text-center">$ CLP</th>
              <th className="px-6 py-5 font-black text-right">Cant.</th>
              <th className="px-6 py-5 font-black text-center">Mec.</th>
              <th className="px-6 py-5 font-black text-center">Uniones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {node.pieces.map((piece, idx) => (
              <PieceRow key={idx} piece={piece} onUpdate={u => handleUpdatePiece(idx, u)} onRemove={() => handleRemovePiece(idx)} catalogItems={catalogItems} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ResultDisplay: React.FC<ResultDisplayProps> = ({ analysisId, result, searchTerm, duplicateIds, onUpdateNode, onRemoveNode, onRemoveAnalysis, onSaveToLibrary, onProcess, onCopyNode, isManual, project, onAddNode, onExportTable, catalogItems }) => {

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

  const existingPieceNames = useMemo(() => {
    const names = new Set<string>();
    if (project) {
      project.categories.forEach(c =>
        c.analyses.forEach(a =>
          a.result?.nodes.forEach(n =>
            n.pieces.forEach(p => {
              if (p.name) names.add(p.name.trim().toUpperCase());
            })
          )
        )
      );
    }
    return Array.from(names).sort();
  }, [project]);

  return (
    <div className="space-y-8 w-full">
      <datalist id="shared-piece-suggestions">
        {existingPieceNames.map(name => <option key={name} value={name} />)}
      </datalist>

      {totalIncomplete > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[1.5rem] p-6 flex items-start gap-5 animate-in slide-in-from-top-4 duration-500 shadow-sm">
          <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <i className="fa-solid fa-list-check text-xl"></i>
          </div>
          <div>
            <h5 className="text-[11px] font-black text-amber-900 uppercase tracking-widest mb-1">Items a revisar por el usuario: {totalIncomplete}</h5>
            <p className="text-[10px] text-amber-700 font-bold uppercase leading-relaxed opacity-80">
              Se han detectado componentes con datos incompletos. <br />
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

      <div className="flex justify-end -mt-4 mb-4 gap-2">
        {onExportTable && (
          <button
            onClick={onExportTable}
            className="px-4 py-2 bg-[#88C13E] text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#a6bf2e] hover:shadow-lg transition-all flex items-center gap-2"
            title="Exportar tabla resumen"
          >
            <i className="fa-solid fa-table"></i> TABLA
          </button>
        )}
        <button
          onClick={onAddNode}
          className="px-4 py-2 bg-[#004071] text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#88C13E] hover:shadow-lg transition-all flex items-center gap-2"
        >
          <i className="fa-solid fa-plus-circle"></i> Agregar Nudo
        </button>
      </div>

      <div className="w-full">
        {filteredNodes.map((node, idx) => {
          const isDuplicate = node.id
            .split(',')
            .map(id => id.trim())
            .filter(Boolean)
            .some(id => duplicateIds.has(`${node.type || 'Otro'}:${normalizeText(id)}`));

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
              onDelete={() => onRemoveNode(node.id)}
              catalogItems={catalogItems}
            />
          );
        })}
      </div>
    </div>
  );
};

export default ResultDisplay;
