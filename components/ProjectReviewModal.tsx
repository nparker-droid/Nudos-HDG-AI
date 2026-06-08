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

const formatWeight = (value: number) =>
  value ? value.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

const escapeXml = (value: string | number) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

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

  const totalWeightForColumn = (column: SummaryColumn) => (totals.get(column.key) || 0) * (column.weight || 0);
  const grandTotalWeight = columns.reduce((sum, column) => sum + totalWeightForColumn(column), 0);

  return { columns, totals, grandTotalPieces, totalAnchorages, duplicateKeys, quantityFor, totalWeightForColumn, grandTotalWeight };
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

    type XmlCell = {
      value?: string | number;
      style?: string;
      type?: 'String' | 'Number';
      mergeAcross?: number;
      mergeDown?: number;
      index?: number;
    };

    const xmlCell = (cell: XmlCell) => {
      const attrs = [
        cell.index ? `ss:Index="${cell.index}"` : '',
        cell.style ? `ss:StyleID="${cell.style}"` : '',
        cell.mergeAcross ? `ss:MergeAcross="${cell.mergeAcross}"` : '',
        cell.mergeDown ? `ss:MergeDown="${cell.mergeDown}"` : ''
      ].filter(Boolean).join(' ');
      if (cell.value === undefined || cell.value === '') return `<Cell${attrs ? ` ${attrs}` : ''}/>`;
      const type = cell.type || (typeof cell.value === 'number' ? 'Number' : 'String');
      return `<Cell${attrs ? ` ${attrs}` : ''}><Data ss:Type="${type}">${escapeXml(cell.value)}</Data></Cell>`;
    };

    const xmlRow = (cells: XmlCell[], height?: number) =>
      `<Row${height ? ` ss:Height="${height}"` : ''}>${cells.map(xmlCell).join('')}</Row>`;

    const appendMatrixSheet = (sheetName: string, nodes: ReviewNode[]) => {
      const matrix = buildMatrix(project, nodes);
      const baseHeaders = ['ID Nudo', 'Nombre Nudo', 'Capitulo', 'Documento'];
      const rows: string[] = [];
      const materialGroups = buildHeaderGroups(matrix.columns, col => col.category);
      const mechanismGroups = buildHeaderGroups(matrix.columns, col => col.mechanismGroup, col => `${col.category}|${col.mechanismGroup}`);
      const pieceGroups = buildHeaderGroups(matrix.columns, col => col.name, col => `${col.category}|${col.mechanismGroup}|${col.name}`);

      rows.push(xmlRow([
        ...baseHeaders.map(label => ({ value: label, style: 'Header', mergeDown: 3 })),
        ...materialGroups.map(group => ({ value: group.label, style: 'Header', mergeAcross: group.span - 1 })),
        { value: 'TOTAL', style: 'Header', mergeDown: 3 },
        { value: 'PESO KG', style: 'Header', mergeDown: 3 },
        { value: 'ANCLAJE', style: 'Header', mergeDown: 3 },
        { value: 'ALERTAS', style: 'Header', mergeDown: 3 }
      ], 24));
      rows.push(xmlRow([
        { index: 5 },
        ...mechanismGroups.map(group => ({ value: group.label, style: 'Header', mergeAcross: group.span - 1 }))
      ], 24));
      rows.push(xmlRow([
        { index: 5 },
        ...pieceGroups.map(group => ({ value: group.label, style: 'Header', mergeAcross: group.span - 1 }))
      ], 30));
      rows.push(xmlRow([
        { index: 5 },
        ...matrix.columns.map(col => ({ value: col.diameter, style: 'Header' }))
      ], 22));

      nodes.forEach(node => {
        const duplicate = matrix.duplicateKeys.has(`${node.type || 'Otro'}:${normalizeText(node.id)}`);
        const incomplete = node.pieces.some(piece => !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0);
        let rowTotal = 0;
        let rowWeight = 0;
        const quantities: XmlCell[] = matrix.columns.map(col => {
          const qty = matrix.quantityFor(node, col);
          if (!col.isUnion) rowTotal += qty;
          rowWeight += qty * (col.weight || 0);
          return { value: qty || '', style: col.isUnion ? 'UnionData' : 'DataCenter', type: 'Number' };
        });
        rows.push(xmlRow([
          { value: node.id, style: 'FrozenId' },
          { value: node.nodeName, style: 'FrozenName' },
          { value: node.categoryName, style: 'Data' },
          { value: node.documentName, style: 'Data' },
          ...quantities,
          { value: rowTotal || '', style: 'TotalData', type: 'Number' },
          { value: rowWeight ? Number(rowWeight.toFixed(2)) : '', style: 'TotalData', type: 'Number' },
          { value: node.anchorageCount || '', style: 'DataCenter', type: 'Number' },
          { value: [duplicate ? 'ID duplicado' : '', incomplete ? 'Revisar piezas' : ''].filter(Boolean).join(', '), style: duplicate || incomplete ? 'Alert' : 'Data' }
        ]));
      });

      if (nodes.length > 0) {
        rows.push(xmlRow([
          { value: 'CANTIDAD TOTAL', style: 'TotalHeader' },
          { value: '', style: 'TotalHeader' },
          { value: '', style: 'TotalHeader' },
          { value: '', style: 'TotalHeader' },
          ...matrix.columns.map(col => ({ value: matrix.totals.get(col.key) || '', style: col.isUnion ? 'UnionTotal' : 'TotalHeader', type: 'Number' as const })),
          { value: matrix.grandTotalPieces, style: 'TotalHeader', type: 'Number' },
          { value: matrix.grandTotalWeight ? Number(matrix.grandTotalWeight.toFixed(2)) : '', style: 'TotalHeader', type: 'Number' },
          { value: matrix.totalAnchorages, style: 'TotalHeader', type: 'Number' },
          { value: '', style: 'TotalHeader' }
        ]));
        rows.push(xmlRow([
          { value: 'PESO UNITARIO KG', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' },
          ...matrix.columns.map(col => ({ value: col.weight || '', style: col.isUnion ? 'UnionWeight' : 'WeightData', type: 'Number' as const })),
          { value: '', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' }
        ]));
        rows.push(xmlRow([
          { value: 'PESO TOTAL KG', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' },
          ...matrix.columns.map(col => {
            const totalWeight = matrix.totalWeightForColumn(col);
            return { value: totalWeight ? Number(totalWeight.toFixed(2)) : '', style: col.isUnion ? 'UnionWeight' : 'WeightData', type: 'Number' as const };
          }),
          { value: '', style: 'WeightHeader' },
          { value: matrix.grandTotalWeight ? Number(matrix.grandTotalWeight.toFixed(2)) : '', style: 'WeightHeader', type: 'Number' },
          { value: '', style: 'WeightHeader' },
          { value: '', style: 'WeightHeader' }
        ]));
      }

      const columnsXml = [
        '<Column ss:Width="85"/>',
        '<Column ss:Width="190"/>',
        '<Column ss:Width="120"/>',
        '<Column ss:Width="120"/>',
        ...matrix.columns.map(() => '<Column ss:Width="90"/>'),
        '<Column ss:Width="70"/>',
        '<Column ss:Width="85"/>',
        '<Column ss:Width="70"/>',
        '<Column ss:Width="155"/>'
      ].join('');

      return `
        <Worksheet ss:Name="${escapeXml(sanitizeSheetName(sheetName))}">
          <Table>${columnsXml}${rows.join('')}</Table>
          <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
            <FreezePanes/>
            <FrozenNoSplit/>
            <SplitHorizontal>4</SplitHorizontal>
            <TopRowBottomPane>4</TopRowBottomPane>
            <SplitVertical>2</SplitVertical>
            <LeftColumnRightPane>2</LeftColumnRightPane>
            <ActivePane>0</ActivePane>
            <Panes>
              <Pane><Number>3</Number></Pane>
              <Pane><Number>1</Number></Pane>
              <Pane><Number>2</Number></Pane>
              <Pane><Number>0</Number></Pane>
            </Panes>
            <ProtectObjects>False</ProtectObjects>
            <ProtectScenarios>False</ProtectScenarios>
          </WorksheetOptions>
        </Worksheet>
      `;
    };

    const allNumericNodes = allNodes.filter(isNumericNode).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const allCameraNodes = allNodes.filter(node => !isNumericNode(node)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const worksheets: string[] = [];
    worksheets.push(appendMatrixSheet('Nudos Global', allNumericNodes));
    Array.from(new Set(allNumericNodes.map(node => node.documentName))).forEach(documentName => {
      worksheets.push(appendMatrixSheet(`Nudos ${documentName}`, allNumericNodes.filter(node => node.documentName === documentName)));
    });
    worksheets.push(appendMatrixSheet('Camaras Global', allCameraNodes));
    Array.from(new Set(allCameraNodes.map(node => node.documentName))).forEach(documentName => {
      worksheets.push(appendMatrixSheet(`Camaras ${documentName}`, allCameraNodes.filter(node => node.documentName === documentName)));
    });

    const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
      <?mso-application progid="Excel.Sheet"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Styles>
          <Style ss:ID="Default" ss:Name="Normal">
            <Alignment ss:Vertical="Center"/>
            <Font ss:FontName="Calibri" ss:Size="10"/>
            <Borders>
              <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E2EC"/>
              <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E2EC"/>
              <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E2EC"/>
              <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E2EC"/>
            </Borders>
          </Style>
          <Style ss:ID="Header">
            <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
            <Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#FFFFFF"/>
            <Interior ss:Color="#004071" ss:Pattern="Solid"/>
            <Borders>
              <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/>
              <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/>
              <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/>
              <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/>
            </Borders>
          </Style>
          <Style ss:ID="Data"><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
          <Style ss:ID="DataCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><NumberFormat ss:Format="0"/></Style>
          <Style ss:ID="FrozenId"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Bold="1" ss:Color="#88C13E"/></Style>
          <Style ss:ID="FrozenName"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:Bold="1" ss:Color="#004071"/></Style>
          <Style ss:ID="UnionData"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#EAF4FF" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#1D4F91"/><NumberFormat ss:Format="0"/></Style>
          <Style ss:ID="TotalData"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Bold="1" ss:Color="#004071"/><NumberFormat ss:Format="0.00"/></Style>
          <Style ss:ID="Alert"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Interior ss:Color="#FFF7D6" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#9A5B00"/></Style>
          <Style ss:ID="TotalHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#004071" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><NumberFormat ss:Format="0.00"/></Style>
          <Style ss:ID="UnionTotal"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#1D4F91" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><NumberFormat ss:Format="0"/></Style>
          <Style ss:ID="WeightHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#E8EEF5" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#004071"/><NumberFormat ss:Format="0.00"/></Style>
          <Style ss:ID="WeightData"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#004071"/><NumberFormat ss:Format="0.00"/></Style>
          <Style ss:ID="UnionWeight"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#EAF4FF" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#1D4F91"/><NumberFormat ss:Format="0.00"/></Style>
        </Styles>
        ${worksheets.join('')}
      </Workbook>`;

    const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Resumen_General_${project.name.replace(/\s+/g, '_')}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
          <table className="min-w-[1400px] w-max text-left border-separate border-spacing-0 text-xs">
            <thead className="bg-white shadow-sm">
              <tr className="bg-[#004071] text-white uppercase text-[9px] tracking-widest h-[42px]">
                <th rowSpan={4} className="sticky top-0 left-0 z-50 px-4 py-3 w-[140px] min-w-[140px] max-w-[140px] border-r border-b border-white/20 bg-[#004071]">ID Nudo</th>
                <th rowSpan={4} className="sticky top-0 left-[140px] z-50 px-4 py-3 w-[260px] min-w-[260px] max-w-[260px] border-r border-b border-white/20 bg-[#004071]">Nombre Nudo</th>
                <th rowSpan={4} className="sticky top-0 z-40 px-3 py-3 min-w-[130px] border-r border-b border-white/20 bg-[#004071]">Capitulo</th>
                <th rowSpan={4} className="sticky top-0 z-40 px-3 py-3 min-w-[130px] border-r border-b border-white/20 bg-[#004071]">Documento</th>
                {buildHeaderGroups(matrix.columns, col => col.category).map(group => (
                  <th key={`mat-${title}-${group.label}-${group.start}`} colSpan={group.span} className={`sticky top-0 z-40 h-[42px] ${headerGroupClass(group)}`}>{group.label}</th>
                ))}
                <th rowSpan={4} className="sticky top-0 z-40 px-3 py-3 min-w-[90px] text-center border-l-4 border-l-white/50 border-b border-white/20 bg-[#004071]">TOTAL</th>
                <th rowSpan={4} className="sticky top-0 z-40 px-3 py-3 min-w-[110px] text-center border-b border-white/20 bg-[#004071]">PESO KG</th>
                <th rowSpan={4} className="sticky top-0 z-40 px-3 py-3 min-w-[90px] text-center border-b border-white/20 bg-[#004071]">ANCLAJE</th>
                <th rowSpan={4} className="sticky top-0 z-40 px-3 py-3 min-w-[150px] border-b border-white/20 bg-[#004071]">ALERTAS</th>
              </tr>
              <tr className="bg-[#004071] text-white uppercase text-[9px] font-black h-[42px]">
                {buildHeaderGroups(matrix.columns, col => col.mechanismGroup, col => `${col.category}|${col.mechanismGroup}`).map(group => (
                  <th key={`mec-${title}-${group.label}-${group.start}`} colSpan={group.span} className={`sticky top-[42px] z-40 h-[42px] ${headerGroupClass(group)}`}>{group.label}</th>
                ))}
              </tr>
              <tr className="bg-[#004071] text-white uppercase text-[9px] font-black h-[42px]">
                {buildHeaderGroups(matrix.columns, col => col.name, col => `${col.category}|${col.mechanismGroup}|${col.name}`).map(group => (
                  <th key={`piece-${title}-${group.label}-${group.start}`} colSpan={group.span} className={`sticky top-[84px] z-40 h-[42px] ${headerGroupClass(group)}`}>{group.label}</th>
                ))}
              </tr>
              <tr className="bg-[#004071] text-white uppercase text-[9px] font-black border-b h-[42px]">
                {matrix.columns.map((col, colIndex) => (
                  <th key={`diam-${title}-${col.key}`} className={`sticky top-[126px] z-40 h-[42px] px-3 py-2 text-center min-w-[105px] border-l border-l-white/20 border-b border-white/20 bg-[#004071] text-white`}>{col.diameter}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nodes.length === 0 ? (
                <tr>
                  <td colSpan={matrix.columns.length + 8} className="px-6 py-14 text-center text-slate-400 font-bold">Sin registros para mostrar.</td>
                </tr>
              ) : nodes.map((node, index) => {
                const duplicate = matrix.duplicateKeys.has(`${node.type || 'Otro'}:${normalizeText(node.id)}`);
                const incomplete = node.pieces.some(piece => !piece.name || !piece.material || !piece.diameter || piece.quantity <= 0);
                let rowTotal = 0;
                let rowWeight = 0;
                return (
                  <tr key={`${title}-${node.id}-${index}`} className={duplicate || incomplete ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                    <td className="sticky left-0 z-30 px-4 py-3 font-black text-[#88C13E] w-[140px] min-w-[140px] max-w-[140px] truncate bg-inherit border-r border-slate-200" title={node.id}>{node.id}</td>
                    <td className="sticky left-[140px] z-30 px-4 py-3 font-bold text-[#004071] w-[260px] min-w-[260px] max-w-[260px] truncate bg-inherit border-r border-slate-200 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]" title={node.nodeName}>{node.nodeName}</td>
                    <td className="px-3 py-3 truncate max-w-[160px]" title={node.categoryName}>{node.categoryName}</td>
                    <td className="px-3 py-3 truncate max-w-[160px]" title={node.documentName}>{node.documentName}</td>
                    {matrix.columns.map((col, colIndex) => {
                      const qty = matrix.quantityFor(node, col);
                      if (!col.isUnion) rowTotal += qty;
                      rowWeight += qty * (col.weight || 0);
                      return <td key={`${title}-${node.id}-${col.key}`} className={`px-3 py-3 text-center font-black ${materialBlockClass(matrix.columns, colIndex, col)} ${col.isUnion ? 'text-blue-700' : 'text-slate-700'}`}>{qty || ''}</td>;
                    })}
                    <td className="px-3 py-3 text-center font-black text-[#004071] border-l-4 border-l-[#004071]">{rowTotal || ''}</td>
                    <td className="px-3 py-3 text-center font-black text-[#004071]">{formatWeight(rowWeight)}</td>
                    <td className="px-3 py-3 text-center font-black text-slate-600">{node.anchorageCount || ''}</td>
                    <td className="px-3 py-3 text-amber-700 font-bold">{[duplicate ? 'ID duplicado' : '', incomplete ? 'Revisar piezas' : ''].filter(Boolean).join(', ')}</td>
                  </tr>
                );
              })}
              {nodes.length > 0 && (
                <tr className="bg-[#004071] text-white font-black uppercase">
                  <td className="sticky left-0 z-30 px-4 py-3 bg-[#004071] border-r border-white/20">Cantidad Total</td>
                  <td className="sticky left-[140px] z-30 px-4 py-3 bg-[#004071] border-r border-white/20 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]"></td>
                  <td></td>
                  <td></td>
                  {matrix.columns.map((col, colIndex) => <td key={`total-${title}-${col.key}`} className={`px-3 py-3 text-center ${materialBlockClass(matrix.columns, colIndex, col)}`}>{matrix.totals.get(col.key) || ''}</td>)}
                  <td className="px-3 py-3 text-center border-l-4 border-l-white/50">{matrix.grandTotalPieces}</td>
                  <td className="px-3 py-3 text-center">{formatWeight(matrix.grandTotalWeight)}</td>
                  <td className="px-3 py-3 text-center">{matrix.totalAnchorages}</td>
                  <td></td>
                </tr>
              )}
              {nodes.length > 0 && (
                <>
                  <tr className="bg-slate-100 text-[#004071] font-black uppercase">
                    <td className="sticky left-0 z-30 px-4 py-3 bg-slate-100 border-r border-slate-200">Peso Unitario kg</td>
                    <td className="sticky left-[140px] z-30 px-4 py-3 bg-slate-100 border-r border-slate-200 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]"></td>
                    <td></td>
                    <td></td>
                    {matrix.columns.map((col, colIndex) => <td key={`unit-weight-${title}-${col.key}`} className={`px-3 py-3 text-center ${materialBlockClass(matrix.columns, colIndex, col)}`}>{formatWeight(col.weight || 0)}</td>)}
                    <td className="px-3 py-3 text-center border-l-4 border-l-[#004071]"></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr className="bg-slate-50 text-[#004071] font-black uppercase">
                    <td className="sticky left-0 z-30 px-4 py-3 bg-slate-50 border-r border-slate-200">Peso Total kg</td>
                    <td className="sticky left-[140px] z-30 px-4 py-3 bg-slate-50 border-r border-slate-200 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]"></td>
                    <td></td>
                    <td></td>
                    {matrix.columns.map((col, colIndex) => <td key={`total-weight-${title}-${col.key}`} className={`px-3 py-3 text-center ${materialBlockClass(matrix.columns, colIndex, col)}`}>{formatWeight(matrix.totalWeightForColumn(col))}</td>)}
                    <td className="px-3 py-3 text-center border-l-4 border-l-[#004071]"></td>
                    <td className="px-3 py-3 text-center">{formatWeight(matrix.grandTotalWeight)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </>
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
