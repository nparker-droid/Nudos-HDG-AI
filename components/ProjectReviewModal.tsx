import React, { useMemo } from 'react';
import { HydraulicNode, Piece, Project } from '../types.ts';

interface ProjectReviewModalProps {
  project: Project;
  onClose: () => void;
}

const normalizeText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

const splitNodeIds = (id: string) => id.split(',').map(part => part.trim()).filter(Boolean);

const mechanismKeywords = ['VALVULA', 'VENTOSA', 'REDUCTORA', 'JUNTA AUTOBLOQUEANTE', 'AUTOBLOQUEANTE', 'HIDRANTE', 'GRIFO'];
const noAutoUnionKeywords = ['UNION', 'BRIDA', 'FLANGE', 'JUNTA', 'PERNO', 'PERNOS', 'TUBO', 'CANERIA', 'CAÑERIA', 'HORMIGON', 'ANCLAJE'];

const inferHasMechanism = (piece: Piece) => {
  const name = normalizeText(piece.name || '');
  return mechanismKeywords.some(keyword => name.includes(keyword));
};

const getUnionCount = (piece: Piece) => {
  if (typeof piece.unionCount === 'number') return piece.unionCount;
  const name = normalizeText(piece.name || '');
  if (!name || noAutoUnionKeywords.some(keyword => name.includes(keyword))) return 0;
  return 2;
};

const getUnionKind = (piece: Piece, project: Project) => {
  const material = normalizeText(String(piece.material || ''));
  if (material.includes('HDPE') || material.includes('PEAD')) return project.hdpeUnionType || 'TF';
  if (material.includes('PVC')) return 'PVC';
  if (material.includes('ACERO') || material.includes('FDO') || material.includes('FIERRO') || material.includes('BRONCE')) return 'Brida';
  return 'Brida';
};

const expandNodes = (project: Project) => {
  const nodes: Array<HydraulicNode & { categoryName: string; documentName: string }> = [];
  project.categories.forEach(category => {
    category.analyses.forEach((analysis, analysisIndex) => {
      (analysis.result?.nodes || []).forEach(node => {
        const ids = splitNodeIds(node.id);
        const expandedIds = ids.length > 1 ? ids : [ids[0] || node.id];
        expandedIds.forEach(id => {
          nodes.push({
            ...node,
            id,
            categoryName: category.name,
            documentName: analysis.customName || `Documento ${analysisIndex + 1}`
          });
        });
      });
    });
  });
  return nodes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
};

type SummaryColumn = {
  key: string;
  category: string;
  name: string;
  diameter: string;
  mechanismGroup: string;
  weight: number;
  isUnion: boolean;
};

const ProjectReviewModal: React.FC<ProjectReviewModalProps> = ({ project, onClose }) => {
  const { nodes, columns, totals, grandTotalPieces, totalAnchorages, duplicateKeys } = useMemo(() => {
    const nodes = expandNodes(project);
    const idCount = new Map<string, number>();
    nodes.forEach(node => {
      const key = `${node.type || 'Otro'}:${normalizeText(node.id)}`;
      idCount.set(key, (idCount.get(key) || 0) + 1);
    });
    const duplicateKeys = new Set(Array.from(idCount.entries()).filter(([, count]) => count > 1).map(([key]) => key));

    const pieceColumns = new Map<string, SummaryColumn>();
    const unionColumns = new Map<string, SummaryColumn>();

    const ensurePieceColumn = (piece: Piece) => {
      const name = (piece.name || '').trim().toUpperCase();
      const mechanismGroup = (piece.hasMechanism ?? inferHasMechanism(piece)) ? 'CON MECANISMO' : 'SIN MECANISMO';
      const material = String(piece.material || 'OTRO');
      const key = `PIEZA|${material}|${mechanismGroup}|${name}|${piece.diameter || ''}`;
      if (!pieceColumns.has(key)) {
        pieceColumns.set(key, {
          key,
          category: material,
          name,
          diameter: piece.diameter || '',
          mechanismGroup,
          weight: piece.weight || 0,
          isUnion: false
        });
      }
      return key;
    };

    const ensureUnionColumn = (piece: Piece) => {
      const unionCount = getUnionCount(piece);
      if (unionCount <= 0) return null;
      const unionKind = piece.union || getUnionKind(piece, project);
      const key = `UNION|${unionKind}|${piece.diameter || ''}`;
      if (!unionColumns.has(key)) {
        unionColumns.set(key, {
          key,
          category: 'UNIONES',
          name: `UNION ${unionKind}`,
          diameter: piece.diameter || '',
          mechanismGroup: 'NO APLICA',
          weight: 0,
          isUnion: true
        });
      }
      return key;
    };

    nodes.forEach(node => {
      node.pieces.forEach(piece => {
        ensurePieceColumn(piece);
        ensureUnionColumn(piece);
      });
    });

    const columns = [
      ...Array.from(pieceColumns.values()).sort((a, b) => a.category.localeCompare(b.category) || a.mechanismGroup.localeCompare(b.mechanismGroup) || a.name.localeCompare(b.name) || a.diameter.localeCompare(b.diameter, undefined, { numeric: true })),
      ...Array.from(unionColumns.values()).sort((a, b) => a.name.localeCompare(b.name) || a.diameter.localeCompare(b.diameter, undefined, { numeric: true }))
    ];

    const totals = new Map<string, number>();
    columns.forEach(col => totals.set(col.key, 0));
    let grandTotalPieces = 0;
    let totalAnchorages = 0;

    nodes.forEach(node => {
      node.pieces.forEach(piece => {
        const pieceKey = ensurePieceColumn(piece);
        const pieceQty = piece.quantity || 0;
        totals.set(pieceKey, (totals.get(pieceKey) || 0) + pieceQty);
        grandTotalPieces += pieceQty;

        const unionKey = ensureUnionColumn(piece);
        if (unionKey) totals.set(unionKey, (totals.get(unionKey) || 0) + pieceQty * getUnionCount(piece));
      });
      totalAnchorages += node.anchorageCount || 0;
    });

    return { nodes, columns, totals, grandTotalPieces, totalAnchorages, duplicateKeys };
  }, [project]);

  const quantityFor = (node: HydraulicNode, column: SummaryColumn) => {
    let qty = 0;
    node.pieces.forEach(piece => {
      const name = (piece.name || '').trim().toUpperCase();
      const mechanismGroup = (piece.hasMechanism ?? inferHasMechanism(piece)) ? 'CON MECANISMO' : 'SIN MECANISMO';
      const material = String(piece.material || 'OTRO');
      const pieceKey = `PIEZA|${material}|${mechanismGroup}|${name}|${piece.diameter || ''}`;
      if (!column.isUnion && pieceKey === column.key) qty += piece.quantity || 0;

      const unionCount = getUnionCount(piece);
      const unionKind = piece.union || getUnionKind(piece, project);
      const unionKey = `UNION|${unionKind}|${piece.diameter || ''}`;
      if (column.isUnion && unionKey === column.key) qty += (piece.quantity || 0) * unionCount;
    });
    return qty;
  };

  return (
    <div className="fixed inset-0 bg-[#002d50]/85 backdrop-blur-md z-[260] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-[96vw] h-[90vh] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col">
        <div className="px-8 py-5 border-b bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-black text-[#004071] uppercase tracking-tighter">Resumen General del Proyecto</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{project.name} / {nodes.length} nudos y camaras</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-[#004071] hover:border-[#004071]">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex-grow overflow-auto">
          <table className="min-w-[1400px] w-max text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr className="bg-[#004071] text-white uppercase text-[9px] tracking-widest">
                <th className="sticky left-0 z-20 bg-[#004071] px-4 py-3 min-w-[120px]">ID Nudo</th>
                <th className="sticky left-[120px] z-20 bg-[#004071] px-4 py-3 min-w-[220px]">Nombre Nudo</th>
                <th className="px-3 py-3 min-w-[130px]">Capitulo</th>
                <th className="px-3 py-3 min-w-[130px]">Documento</th>
                {columns.map(col => <th key={`cat-${col.key}`} className="px-3 py-3 min-w-[105px] text-center">{col.category}</th>)}
                <th className="px-3 py-3 min-w-[90px] text-center">TOTAL</th>
                <th className="px-3 py-3 min-w-[90px] text-center">ANCLAJE</th>
                <th className="px-3 py-3 min-w-[150px]">ALERTAS</th>
              </tr>
              <tr className="bg-slate-50 text-[#004071] uppercase text-[9px] font-black">
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-2"></th>
                <th className="sticky left-[120px] z-20 bg-slate-50 px-4 py-2"></th>
                <th></th>
                <th></th>
                {columns.map(col => <th key={`name-${col.key}`} className="px-3 py-2 text-center">{col.name}</th>)}
                <th></th>
                <th></th>
                <th></th>
              </tr>
              <tr className="bg-slate-100 text-slate-500 uppercase text-[9px] font-black">
                <th className="sticky left-0 z-20 bg-slate-100 px-4 py-2"></th>
                <th className="sticky left-[120px] z-20 bg-slate-100 px-4 py-2"></th>
                <th></th>
                <th></th>
                {columns.map(col => <th key={`diam-${col.key}`} className="px-3 py-2 text-center">{col.diameter}</th>)}
                <th></th>
                <th></th>
                <th></th>
              </tr>
              <tr className="bg-white text-slate-400 uppercase text-[9px] font-black border-b">
                <th className="sticky left-0 z-20 bg-white px-4 py-2"></th>
                <th className="sticky left-[120px] z-20 bg-white px-4 py-2"></th>
                <th></th>
                <th></th>
                {columns.map(col => <th key={`mec-${col.key}`} className="px-3 py-2 text-center">{col.mechanismGroup}</th>)}
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nodes.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 7} className="px-6 py-16 text-center text-slate-400 font-bold">No hay nudos analizados en este proyecto.</td>
                </tr>
              ) : nodes.map((node, index) => {
                const duplicate = duplicateKeys.has(`${node.type || 'Otro'}:${normalizeText(node.id)}`);
                const incomplete = node.pieces.some(piece => !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0);
                let rowTotal = 0;
                return (
                  <tr key={`${node.id}-${index}`} className={duplicate || incomplete ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                    <td className="sticky left-0 bg-inherit px-4 py-3 font-black text-[#88C13E] min-w-[120px]">{node.id}</td>
                    <td className="sticky left-[120px] bg-inherit px-4 py-3 font-bold text-[#004071] min-w-[220px]">{node.nodeName}</td>
                    <td className="px-3 py-3">{node.categoryName}</td>
                    <td className="px-3 py-3">{node.documentName}</td>
                    {columns.map(col => {
                      const qty = quantityFor(node, col);
                      if (!col.isUnion) rowTotal += qty;
                      return <td key={`${node.id}-${col.key}`} className={`px-3 py-3 text-center font-black ${col.isUnion ? 'text-blue-700 bg-blue-50/40' : 'text-slate-700'}`}>{qty || ''}</td>;
                    })}
                    <td className="px-3 py-3 text-center font-black text-[#004071]">{rowTotal || ''}</td>
                    <td className="px-3 py-3 text-center font-black text-slate-600">{node.anchorageCount || ''}</td>
                    <td className="px-3 py-3 text-amber-700 font-bold">{[duplicate ? 'ID duplicado' : '', incomplete ? 'Revisar piezas' : ''].filter(Boolean).join(', ')}</td>
                  </tr>
                );
              })}
              {nodes.length > 0 && (
                <>
                  <tr className="bg-[#004071] text-white font-black uppercase">
                    <td className="sticky left-0 bg-[#004071] px-4 py-3">Cantidad Total</td>
                    <td className="sticky left-[120px] bg-[#004071] px-4 py-3"></td>
                    <td></td>
                    <td></td>
                    {columns.map(col => <td key={`total-${col.key}`} className="px-3 py-3 text-center">{totals.get(col.key) || ''}</td>)}
                    <td className="px-3 py-3 text-center">{grandTotalPieces}</td>
                    <td className="px-3 py-3 text-center">{totalAnchorages}</td>
                    <td></td>
                  </tr>
                  <tr className="bg-slate-50 text-slate-500 font-black uppercase">
                    <td className="sticky left-0 bg-slate-50 px-4 py-3">Peso Unitario</td>
                    <td className="sticky left-[120px] bg-slate-50 px-4 py-3"></td>
                    <td></td>
                    <td></td>
                    {columns.map(col => <td key={`weight-${col.key}`} className="px-3 py-3 text-center">{col.weight ? col.weight.toFixed(2) : ''}</td>)}
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProjectReviewModal;
