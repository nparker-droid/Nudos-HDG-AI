import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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

type HeaderGroup = { label: string; groupKey: string; start: number; span: number };

const buildHeaderGroups = (
  columns: SummaryColumn[],
  labelFn: (column: SummaryColumn) => string,
  groupKeyFn: (column: SummaryColumn) => string = labelFn
): HeaderGroup[] => {
  const groups: HeaderGroup[] = [];
  columns.forEach((column, index) => {
    const label = labelFn(column);
    const groupKey = groupKeyFn(column);
    const last = groups[groups.length - 1];
    if (last && last.groupKey === groupKey) {
      last.span += 1;
    } else {
      groups.push({ label, groupKey, start: index, span: 1 });
    }
  });
  return groups;
};

const headerGroupClass = (group: HeaderGroup) =>
  `px-3 py-3 text-center border-l-4 border-l-white/40 border-b border-white/20 bg-[#004071] text-white`;

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

  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    const usedSheetNames = new Set<string>();
    const sanitizeSheetName = (name: string) => {
      const clean = name.replace(/[\\/?*\[\]:]/g, ' ').trim() || 'Hoja';
      let base = clean.slice(0, 31);
      let candidate = base;
      let counter = 1;
      while (usedSheetNames.has(candidate)) {
        const suffix = ` ${counter}`;
        candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        counter += 1;
      }
      usedSheetNames.add(candidate);
      return candidate;
    };

    const appendMatrixSheet = (sheetName: string, nodes: ReviewNode[]) => {
      const matrix = buildMatrix(project, nodes);
      const rows: Array<Array<string | number>> = [];
      const merges: XLSX.Range[] = [];
      const baseHeaders = ['ID Nudo', 'Nombre Nudo', 'Capitulo', 'Documento'];

      rows.push([...baseHeaders, ...Array(matrix.columns.length).fill(''), 'TOTAL', 'ANCLAJE', 'ALERTAS']);
      rows.push([...Array(4).fill(''), ...Array(matrix.columns.length).fill(''), '', '', '']);
      rows.push([...Array(4).fill(''), ...Array(matrix.columns.length).fill(''), '', '', '']);
      rows.push([...Array(4).fill(''), ...matrix.columns.map(col => col.diameter), '', '', '']);

      baseHeaders.forEach((_, colIndex) => merges.push({ s: { r: 0, c: colIndex }, e: { r: 3, c: colIndex } }));
      const tailStart = 4 + matrix.columns.length;
      [tailStart, tailStart + 1, tailStart + 2].forEach(colIndex => merges.push({ s: { r: 0, c: colIndex }, e: { r: 3, c: colIndex } }));

      const addHeaderGroups = (rowIndex: number, groups: HeaderGroup[]) => {
        groups.forEach(group => {
          const col = 4 + group.start;
          rows[rowIndex][col] = group.label;
          if (group.span > 1) merges.push({ s: { r: rowIndex, c: col }, e: { r: rowIndex, c: col + group.span - 1 } });
        });
      };

      addHeaderGroups(0, buildHeaderGroups(matrix.columns, col => col.category));
      addHeaderGroups(1, buildHeaderGroups(matrix.columns, col => col.mechanismGroup, col => `${col.category}|${col.mechanismGroup}`));
      addHeaderGroups(2, buildHeaderGroups(matrix.columns, col => col.name, col => `${col.category}|${col.mechanismGroup}|${col.name}`));

      nodes.forEach(node => {
        const duplicate = matrix.duplicateKeys.has(`${node.type || 'Otro'}:${normalizeText(node.id)}`);
        const incomplete = node.pieces.some(piece => !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0);
        let rowTotal = 0;
        const quantities = matrix.columns.map(col => {
          const qty = matrix.quantityFor(node, col);
          if (!col.isUnion) rowTotal += qty;
          return qty || '';
        });
        rows.push([
          node.id,
          node.nodeName,
          node.categoryName,
          node.documentName,
          ...quantities,
          rowTotal || '',
          node.anchorageCount || '',
          [duplicate ? 'ID duplicado' : '', incomplete ? 'Revisar piezas' : ''].filter(Boolean).join(', ')
        ]);
      });

      if (nodes.length > 0) {
        rows.push([
          'CANTIDAD TOTAL',
          '',
          '',
          '',
          ...matrix.columns.map(col => matrix.totals.get(col.key) || ''),
          matrix.grandTotalPieces,
          matrix.totalAnchorages,
          ''
        ]);
      }

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!merges'] = merges;
      worksheet['!cols'] = [
        { wch: 16 },
        { wch: 32 },
        { wch: 20 },
        { wch: 20 },
        ...matrix.columns.map(() => ({ wch: 16 })),
        { wch: 12 },
        { wch: 12 },
        { wch: 24 }
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheetName));
    };

    const allNumericNodes = allNodes.filter(isNumericNode).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const allCameraNodes = allNodes.filter(node => !isNumericNode(node)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    appendMatrixSheet('Nudos Global', allNumericNodes);
    Array.from(new Set(allNumericNodes.map(node => node.documentName))).forEach(documentName => {
      appendMatrixSheet(`Nudos ${documentName}`, allNumericNodes.filter(node => node.documentName === documentName));
    });
    appendMatrixSheet('Camaras Global', allCameraNodes);
    Array.from(new Set(allCameraNodes.map(node => node.documentName))).forEach(documentName => {
      appendMatrixSheet(`Camaras ${documentName}`, allCameraNodes.filter(node => node.documentName === documentName));
    });

    XLSX.writeFile(workbook, `Resumen_General_${project.name.replace(/\s+/g, '_')}.xlsx`);
  };

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
              <tr className="bg-[#004071] text-white uppercase text-[9px] font-black">
                {buildHeaderGroups(matrix.columns, col => col.mechanismGroup, col => `${col.category}|${col.mechanismGroup}`).map(group => (
                  <th key={`mec-${title}-${group.label}-${group.start}`} colSpan={group.span} className={headerGroupClass(group)}>{group.label}</th>
                ))}
              </tr>
              <tr className="bg-[#004071] text-white uppercase text-[9px] font-black">
                {buildHeaderGroups(matrix.columns, col => col.name, col => `${col.category}|${col.mechanismGroup}|${col.name}`).map(group => (
                  <th key={`piece-${title}-${group.label}-${group.start}`} colSpan={group.span} className={headerGroupClass(group)}>{group.label}</th>
                ))}
              </tr>
              <tr className="bg-[#004071] text-white uppercase text-[9px] font-black border-b">
                {matrix.columns.map((col, colIndex) => (
                  <th key={`diam-${title}-${col.key}`} className={`px-3 py-2 text-center min-w-[105px] border-l border-l-white/20 bg-[#004071] text-white`}>{col.diameter}</th>
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
          <button onClick={exportWorkbook} className="px-5 py-3 bg-[#88C13E] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#76a936] transition-colors flex items-center gap-2">
            <i className="fa-solid fa-file-excel"></i> Exportar Excel
          </button>
        </div>
      </div>
      {renderTable('Tabla de Nudos', numericNodes)}
      {renderTable('Tabla de Camaras', cameraNodes)}
    </div>
  );
};

export default ProjectReviewModal;
