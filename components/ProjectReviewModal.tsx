import React, { useMemo, useState } from 'react';
import { HydraulicNode, Piece, Project } from '../types.ts';

interface ProjectReviewModalProps {
  project: Project;
  onClose?: () => void;
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

const shouldAutoAddUnions = (piece: Piece) => {
  const name = normalizeText(piece.name || '');
  return !!name && !noAutoUnionKeywords.some(keyword => name.includes(keyword));
};

const extractDiameterParts = (diameter: string) => {
  const matches = (diameter || '').match(/\d+(?:[,.]\d+)?/g) || [];
  return matches.map(m => m.replace(',', '.')).filter(Boolean);
};

const getUnionKind = (piece: Piece, project: Project) => {
  const material = normalizeText(String(piece.material || ''));
  if (material.includes('HDPE') || material.includes('PEAD')) return project.hdpeUnionType || 'TF';
  if (material.includes('PVC')) return 'PVC';
  if (material.includes('ACERO') || material.includes('FDO') || material.includes('FIERRO') || material.includes('BRONCE')) return 'Brida';
  return 'Brida';
};

const getUnionBreakdown = (piece: Piece, project: Project) => {
  if (!shouldAutoAddUnions(piece) && typeof piece.unionCount !== 'number') return [];
  const name = normalizeText(piece.name || '');
  const diameters = extractDiameterParts(piece.diameter);
  const fallbackDiameter = piece.diameter || 'S/D';
  const unionKind = piece.union || getUnionKind(piece, project);
  const byDiameter = new Map<string, number>();
  const add = (diameter: string, count: number) => {
    if (count <= 0) return;
    const key = diameter || fallbackDiameter;
    byDiameter.set(key, (byDiameter.get(key) || 0) + count);
  };

  if (name.includes('STUB') || name.includes('COPLA')) {
    add(diameters[0] || fallbackDiameter, typeof piece.unionCount === 'number' ? piece.unionCount : 1);
  } else if (name.includes('TEE')) {
    if (diameters.length >= 3) diameters.slice(0, 3).forEach(d => add(d, 1));
    else if (diameters.length >= 2) {
      add(diameters[0], 2);
      add(diameters[1], 1);
    } else add(diameters[0] || fallbackDiameter, 3);
  } else if (name.includes('REDUCCION') || name.includes('REDUCCIÓN')) {
    if (diameters.length >= 2) {
      add(diameters[0], 1);
      add(diameters[1], 1);
    } else add(diameters[0] || fallbackDiameter, 2);
  } else {
    add(diameters[0] || fallbackDiameter, typeof piece.unionCount === 'number' ? piece.unionCount : 2);
  }

  return Array.from(byDiameter.entries()).map(([diameter, count]) => ({ unionKind, diameter, count }));
};

const formatUnionDiameterForKind = (unionKind: string, diameter: string) => {
  if (normalizeText(unionKind).includes('BRIDA') && /^\d+(?:[,.]\d+)?$/.test(diameter)) {
    return `${diameter}"`;
  }
  return diameter;
};

type ReviewNode = HydraulicNode & { categoryName: string; documentName: string };
type SummaryColumn = {
  key: string;
  category: string;
  name: string;
  diameter: string;
  mechanismGroup: string;
  weight: number;
  isUnion: boolean;
};

const expandNodes = (project: Project) => {
  const nodes: ReviewNode[] = [];
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
  return nodes;
};

const isNumericNode = (node: ReviewNode) => (node.type || 'Numerico') === 'Numerico';

const buildMatrix = (project: Project, sourceNodes: ReviewNode[]) => {
  const idCount = new Map<string, number>();
  sourceNodes.forEach(node => {
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
      pieceColumns.set(key, { key, category: material, name, diameter: piece.diameter || '', mechanismGroup, weight: piece.weight || 0, isUnion: false });
    }
    return key;
  };

  const ensureUnionColumn = (unionKind: string, diameter: string) => {
    const displayDiameter = formatUnionDiameterForKind(unionKind, diameter);
    const key = `UNION|${unionKind}|${displayDiameter}`;
    if (!unionColumns.has(key)) {
      unionColumns.set(key, { key, category: 'UNIONES', name: `UNION ${unionKind}`, diameter: displayDiameter, mechanismGroup: 'NO APLICA', weight: 0, isUnion: true });
    }
    return key;
  };

  sourceNodes.forEach(node => {
    node.pieces.forEach(piece => {
      ensurePieceColumn(piece);
      getUnionBreakdown(piece, project).forEach(part => ensureUnionColumn(part.unionKind, part.diameter));
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

  sourceNodes.forEach(node => {
    node.pieces.forEach(piece => {
      const pieceKey = ensurePieceColumn(piece);
      const pieceQty = piece.quantity || 0;
      totals.set(pieceKey, (totals.get(pieceKey) || 0) + pieceQty);
      grandTotalPieces += pieceQty;
      getUnionBreakdown(piece, project).forEach(part => {
        const unionKey = ensureUnionColumn(part.unionKind, part.diameter);
        totals.set(unionKey, (totals.get(unionKey) || 0) + pieceQty * part.count);
      });
    });
    totalAnchorages += node.anchorageCount || 0;
  });

  const quantityFor = (node: ReviewNode, column: SummaryColumn) => {
    let qty = 0;
    node.pieces.forEach(piece => {
      const name = (piece.name || '').trim().toUpperCase();
      const mechanismGroup = (piece.hasMechanism ?? inferHasMechanism(piece)) ? 'CON MECANISMO' : 'SIN MECANISMO';
      const material = String(piece.material || 'OTRO');
      const pieceKey = `PIEZA|${material}|${mechanismGroup}|${name}|${piece.diameter || ''}`;
      if (!column.isUnion && pieceKey === column.key) qty += piece.quantity || 0;
      getUnionBreakdown(piece, project).forEach(part => {
        const unionKey = `UNION|${part.unionKind}|${formatUnionDiameterForKind(part.unionKind, part.diameter)}`;
        if (column.isUnion && unionKey === column.key) qty += (piece.quantity || 0) * part.count;
      });
    });
    return qty;
  };

  return { columns, totals, grandTotalPieces, totalAnchorages, duplicateKeys, quantityFor };
};

const materialBlockClass = (columns: SummaryColumn[], index: number, col: SummaryColumn) => {
  const startsBlock = index === 0 || columns[index - 1].category !== col.category;
  const unionTone = col.category === 'UNIONES' ? 'bg-blue-50/80' : '';
  return `${startsBlock ? 'border-l-4 border-l-[#004071]' : 'border-l border-l-slate-100'} ${unionTone}`;
};

type HeaderGroup = { label: string; start: number; span: number; tone: string };

const buildHeaderGroups = (columns: SummaryColumn[], keyFn: (column: SummaryColumn) => string): HeaderGroup[] => {
  const groups: HeaderGroup[] = [];
  columns.forEach((column, index) => {
    const label = keyFn(column);
    const tone = column.category === 'UNIONES' ? 'bg-blue-50/90 text-blue-800' : '';
    const last = groups[groups.length - 1];
    if (last && last.label === label && last.tone === tone) {
      last.span += 1;
    } else {
      groups.push({ label, start: index, span: 1, tone });
    }
  });
  return groups;
};

const headerGroupClass = (group: HeaderGroup) =>
  `px-3 py-3 text-center border-l-4 border-l-[#004071] border-b border-slate-200 ${group.tone}`;

const ProjectReviewModal: React.FC<ProjectReviewModalProps> = ({ project }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'name' | 'category' | 'document' | 'alerts'>('id');
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  const allNodes = useMemo(() => expandNodes(project), [project]);

  const filterAndSort = (nodes: ReviewNode[]) => {
    const lower = searchTerm.toLowerCase();
    return nodes
      .filter(node => {
        const text = `${node.id} ${node.nodeName} ${node.type} ${node.categoryName} ${node.documentName} ${node.pieces.map(p => `${p.name} ${p.material} ${p.diameter}`).join(' ')}`.toLowerCase();
        const hasAlert = node.pieces.some(piece => !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0);
        return (!lower || text.includes(lower)) && (!onlyAlerts || hasAlert);
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.nodeName.localeCompare(b.nodeName);
        if (sortBy === 'category') return a.categoryName.localeCompare(b.categoryName) || a.id.localeCompare(b.id, undefined, { numeric: true });
        if (sortBy === 'document') return a.documentName.localeCompare(b.documentName) || a.id.localeCompare(b.id, undefined, { numeric: true });
        if (sortBy === 'alerts') {
          const aa = a.pieces.some(piece => !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0) ? 0 : 1;
          const bb = b.pieces.some(piece => !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0) ? 0 : 1;
          return aa - bb || a.id.localeCompare(b.id, undefined, { numeric: true });
        }
        return a.id.localeCompare(b.id, undefined, { numeric: true });
      });
  };

  const numericNodes = filterAndSort(allNodes.filter(isNumericNode));
  const cameraNodes = filterAndSort(allNodes.filter(node => !isNumericNode(node)));

  const renderTable = (title: string, nodes: ReviewNode[]) => {
    const matrix = buildMatrix(project, nodes);
    return (
      <section className="bg-white border border-slate-200 rounded-[1.5rem] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-[#004071] uppercase tracking-widest">{title}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{nodes.length} registros</p>
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="min-w-[1400px] w-max text-left border-collapse text-xs">
            <thead className="bg-white shadow-sm">
              <tr className="bg-[#004071] text-white uppercase text-[9px] tracking-widest">
                <th rowSpan={4} className="px-4 py-3 w-[140px] min-w-[140px] max-w-[140px] border-r border-white/10">ID Nudo</th>
                <th rowSpan={4} className="px-4 py-3 w-[260px] min-w-[260px] max-w-[260px] border-r border-white/10">Nombre Nudo</th>
                <th rowSpan={4} className="px-3 py-3 min-w-[130px] border-r border-white/10">Capitulo</th>
                <th rowSpan={4} className="px-3 py-3 min-w-[130px] border-r border-white/10">Documento</th>
                {buildHeaderGroups(matrix.columns, col => col.category).map(group => (
                  <th key={`mat-${title}-${group.label}-${group.start}`} colSpan={group.span} className={headerGroupClass(group)}>{group.label}</th>
                ))}
                <th rowSpan={4} className="px-3 py-3 min-w-[90px] text-center border-l-4 border-l-[#004071]">TOTAL</th>
                <th rowSpan={4} className="px-3 py-3 min-w-[90px] text-center">ANCLAJE</th>
                <th rowSpan={4} className="px-3 py-3 min-w-[150px]">ALERTAS</th>
              </tr>
              <tr className="bg-slate-50 text-[#004071] uppercase text-[9px] font-black">
                {buildHeaderGroups(matrix.columns, col => col.mechanismGroup).map(group => (
                  <th key={`mec-${title}-${group.label}-${group.start}`} colSpan={group.span} className={headerGroupClass(group)}>{group.label}</th>
                ))}
              </tr>
              <tr className="bg-slate-100 text-slate-600 uppercase text-[9px] font-black">
                {buildHeaderGroups(matrix.columns, col => col.name).map(group => (
                  <th key={`piece-${title}-${group.label}-${group.start}`} colSpan={group.span} className={headerGroupClass(group)}>{group.label}</th>
                ))}
              </tr>
              <tr className="bg-white text-slate-500 uppercase text-[9px] font-black border-b">
                {matrix.columns.map((col, colIndex) => (
                  <th key={`diam-${title}-${col.key}`} className={`px-3 py-2 text-center min-w-[105px] ${materialBlockClass(matrix.columns, colIndex, col)}`}>{col.diameter}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nodes.length === 0 ? (
                <tr>
                  <td colSpan={matrix.columns.length + 7} className="px-6 py-14 text-center text-slate-400 font-bold">Sin registros para mostrar.</td>
                </tr>
              ) : nodes.map((node, index) => {
                const duplicate = matrix.duplicateKeys.has(`${node.type || 'Otro'}:${normalizeText(node.id)}`);
                const incomplete = node.pieces.some(piece => !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0);
                let rowTotal = 0;
                return (
                  <tr key={`${title}-${node.id}-${index}`} className={duplicate || incomplete ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3 font-black text-[#88C13E] w-[140px] min-w-[140px] max-w-[140px] truncate bg-inherit" title={node.id}>{node.id}</td>
                    <td className="px-4 py-3 font-bold text-[#004071] w-[260px] min-w-[260px] max-w-[260px] truncate bg-inherit" title={node.nodeName}>{node.nodeName}</td>
                    <td className="px-3 py-3 truncate max-w-[160px]" title={node.categoryName}>{node.categoryName}</td>
                    <td className="px-3 py-3 truncate max-w-[160px]" title={node.documentName}>{node.documentName}</td>
                    {matrix.columns.map((col, colIndex) => {
                      const qty = matrix.quantityFor(node, col);
                      if (!col.isUnion) rowTotal += qty;
                      return <td key={`${title}-${node.id}-${col.key}`} className={`px-3 py-3 text-center font-black ${materialBlockClass(matrix.columns, colIndex, col)} ${col.isUnion ? 'text-blue-700' : 'text-slate-700'}`}>{qty || ''}</td>;
                    })}
                    <td className="px-3 py-3 text-center font-black text-[#004071] border-l-4 border-l-[#004071]">{rowTotal || ''}</td>
                    <td className="px-3 py-3 text-center font-black text-slate-600">{node.anchorageCount || ''}</td>
                    <td className="px-3 py-3 text-amber-700 font-bold">{[duplicate ? 'ID duplicado' : '', incomplete ? 'Revisar piezas' : ''].filter(Boolean).join(', ')}</td>
                  </tr>
                );
              })}
              {nodes.length > 0 && (
                <tr className="bg-[#004071] text-white font-black uppercase">
                  <td className="px-4 py-3">Cantidad Total</td>
                  <td className="px-4 py-3"></td>
                  <td></td>
                  <td></td>
                  {matrix.columns.map((col, colIndex) => <td key={`total-${title}-${col.key}`} className={`px-3 py-3 text-center ${materialBlockClass(matrix.columns, colIndex, col)}`}>{matrix.totals.get(col.key) || ''}</td>)}
                  <td className="px-3 py-3 text-center border-l-4 border-l-white/50">{matrix.grandTotalPieces}</td>
                  <td className="px-3 py-3 text-center">{matrix.totalAnchorages}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white border border-slate-200 rounded-[1.5rem] shadow-sm px-6 py-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#004071] uppercase tracking-tighter">Resumen General del Proyecto</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{project.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <i className="fa-solid fa-filter absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filtrar como Excel..."
              className="pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#004071] w-72 focus:bg-white focus:border-[#88C13E] outline-none"
            />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black text-[#004071] uppercase">
            <option value="id">Ordenar por ID</option>
            <option value="name">Ordenar por nombre</option>
            <option value="category">Ordenar por capitulo</option>
            <option value="document">Ordenar por documento</option>
            <option value="alerts">Errores primero</option>
          </select>
          <label className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black text-[#004071] uppercase">
            <input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)} />
            Solo alertas
          </label>
        </div>
      </div>
      {renderTable('Tabla de Nudos', numericNodes)}
      {renderTable('Tabla de Camaras', cameraNodes)}
    </div>
  );
};

export default ProjectReviewModal;
