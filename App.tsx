
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FileUploader from './components/FileUploader.tsx';
import ResultDisplay from './components/ResultDisplay.tsx';
import Sidebar from './components/Sidebar.tsx';
import { analyzeHydraulicPlan } from './services/geminiService.ts';
// Fixed: Added AnalysisResult to the imports from types.ts
import { Project, FileAnalysis, Category, HydraulicNode, Piece, NodeMaterial, LibraryNode, AnalysisResult, CatalogItem } from './types.ts';
import AnalysisCard from './components/AnalysisCard.tsx';
import AddNodeModal from './components/AddNodeModal.tsx';
import LibraryModal from './components/LibraryModal.tsx';
import AuditReportModal from './components/AuditReportModal.tsx';
import CatalogModal from './components/CatalogModal.tsx';
import { findWeightInCatalog } from './services/catalogService.ts';

const INITIAL_CREDITS = 50;

// Utility to strictly sort and format ID strings (e.g. "05, 01" -> "01, 05")
const sortIdString = (val: string): string => {
  return val.split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s.replace(/(\d+)/, (match) => match.padStart(2, '0')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .join(', ');
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const SUGGESTED_PRICES: Record<string, number> = {
  'VÁLVULA': 450000,
  'CODO': 45000,
  'TEE': 65000,
  'REDUCCIÓN': 35000,
  'TUBO': 12000,
  'UNION': 25000,
  'COPLA': 22000,
  'STUB END': 28000,
  'FLANGE': 42000,
  'JUNTA': 55000,
  'PERNOS': 1500,
  'HORMIGÓN': 145000,
  'ANCLAJE': 180000
};

const getEstimatedWeight = (name: string, diameter: string, material: string, catalogItems?: CatalogItem[]): number => {
  if (catalogItems && catalogItems.length > 0) {
    const catalogWeight = findWeightInCatalog(name, diameter, material, catalogItems);
    if (catalogWeight !== null) {
      return catalogWeight;
    }
  }

  const dnMatch = diameter.match(/\d+/);
  const dn = dnMatch ? parseInt(dnMatch[0]) : 100;
  const n = name.toLowerCase();
  const m = material.toLowerCase();

  let baseWeight = 0;
  if (n.includes('válvula') || n.includes('valvula')) {
    baseWeight = dn * 0.8;
  } else if (n.includes('codo') || n.includes('tee') || n.includes('reducción') || n.includes('curva')) {
    if (m.includes('hdpe')) baseWeight = dn * 0.05;
    else if (m.includes('acero') || m.includes('fierro') || m.includes('fdo')) baseWeight = dn * 0.35;
    else baseWeight = dn * 0.2;
  } else if (n.includes('tubo') || n.includes('cañería')) {
    baseWeight = (dn * 0.1) * 6;
  } else if (n.includes('unión') || n.includes('copla') || n.includes('flange')) {
    baseWeight = dn * 0.15;
  } else {
    baseWeight = dn * 0.1;
  }
  return parseFloat(baseWeight.toFixed(2));
};

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [libraryNodes, setLibraryNodes] = useState<LibraryNode[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [credits, setCredits] = useState<number>(INITIAL_CREDITS);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [copiedNode, setCopiedNode] = useState<HydraulicNode | null>(null);
  const [notification, setNotification] = useState('');
  const [isAutoSaving, setIsAutoSaving] = useState(false);
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

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    type: 'project' | 'category' | 'analysis' | 'node';
    projectId: string;
    categoryId?: string;
    analysisId?: string;
    nodeId?: string;
    name: string;
  }>({ show: false, type: 'project', projectId: '', name: '' });

  const [projectForm, setProjectForm] = useState<Partial<Project>>({
    code: 'HDG-',
    name: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    version: 'A',
    stage: 'Ingeniería de Detalle',
    commune: '',
    region: ''
  });

  useEffect(() => {
    const savedProjects = localStorage.getItem('hidrogestion_v10_projects');
    const savedLibrary = localStorage.getItem('hidrogestion_v10_library');
    const savedCredits = localStorage.getItem('hidrogestion_v10_credits');
    const savedCatalog = localStorage.getItem('hidrogestion_v10_catalog');

    if (savedProjects) try { setProjects(JSON.parse(savedProjects)); } catch (e) { }
    if (savedLibrary) try { setLibraryNodes(JSON.parse(savedLibrary)); } catch (e) { }
    if (savedCatalog) try { setCatalogItems(JSON.parse(savedCatalog)); } catch (e) { }
    if (savedCredits !== null) setCredits(parseInt(savedCredits));
  }, []);

  useEffect(() => {
    if (projects.length > 0 || libraryNodes.length > 0 || catalogItems.length > 0) {
      setIsAutoSaving(true);
      localStorage.setItem('hidrogestion_v10_projects', JSON.stringify(projects));
      localStorage.setItem('hidrogestion_v10_library', JSON.stringify(libraryNodes));
      localStorage.setItem('hidrogestion_v10_catalog', JSON.stringify(catalogItems));
      localStorage.setItem('hidrogestion_v10_credits', credits.toString());

      const timer = setTimeout(() => setIsAutoSaving(false), 800);
      return () => clearTimeout(timer);
    }
  }, [projects, libraryNodes, credits]);

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);
  const activeCategory = useMemo(() => activeProject?.categories.find(c => c.id === activeCategoryId), [activeProject, activeCategoryId]);

  // --- Auditoría Global de Capítulo ---
  const chapterNodes = useMemo(() => {
    if (!activeCategory) return [];
    return activeCategory.analyses.flatMap((a, idx) =>
      (a.result?.nodes || []).map(node => ({ ...node, docIndex: idx + 1 }))
    );
  }, [activeCategory]);

  const chapterDuplicateIds = useMemo(() => {
    const idCount = new Map<string, number>();
    const duplicates = new Set<string>();
    chapterNodes.forEach(node => {
      const matches = node.id.match(/\d+/g);
      if (matches) {
        matches.forEach(id => {
          const normalizedId = id.trim().toLowerCase();
          if (normalizedId) {
            const uniqueKey = `${node.type}:${normalizedId}`;
            idCount.set(uniqueKey, (idCount.get(uniqueKey) || 0) + 1);
            if (idCount.get(uniqueKey)! > 1) duplicates.add(uniqueKey);
          }
        });
      }
    });
    return duplicates;
  }, [chapterNodes]);

  const missingNodesGlobal = useMemo(() => {
    const idsByType: Record<string, Set<number>> = {
      Numerico: new Set(),
      Corte: new Set(),
      Ventosa: new Set(),
      Desague: new Set(),
      Reductora: new Set()
    };

    chapterNodes.forEach(node => {
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
  }, [chapterNodes]);

  const missingNodesGrouped = useMemo(() => {
    const groups: Record<string, { type: string, number: number }[]> = {};
    missingNodesGlobal.forEach(n => {
      if (!groups[n.type]) groups[n.type] = [];
      groups[n.type].push(n);
    });
    return groups;
  }, [missingNodesGlobal]);

  const unifiedNodesSummaryGlobal = useMemo(() => {
    return chapterNodes.filter(node => node.sourceGroupings && node.sourceGroupings.length > 1);
  }, [chapterNodes]);

  const isAnythingToReportGlobal = unifiedNodesSummaryGlobal.length > 0 || missingNodesGlobal.length > 0;

  const handleToggleMissingNodeReport = (nodeKey: string) => {
    setNodesToReportMissing(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeKey)) newSet.delete(nodeKey);
      else newSet.add(nodeKey);
      return newSet;
    });
  };

  const handleToggleSelectAllMissingNodes = () => {
    if (nodesToReportMissing.size === missingNodesGlobal.length) {
      setNodesToReportMissing(new Set());
    } else {
      const allKeys = missingNodesGlobal.map(n => `${n.type}:${n.number}`);
      setNodesToReportMissing(new Set(allKeys));
    }
  };

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

  const formatIdsForDisplayGlobal = (idStr: string, type: string) => {
    const matches = idStr.match(/\d+/g);
    if (!matches) return idStr;
    const prefix = getPrefixLabel(type);
    return matches.map(m => {
      const num = parseInt(m, 10);
      return prefix ? `${prefix}-${num}` : m.padStart(2, '0');
    }).join(', ');
  };

  const handleCopyNode = (node: HydraulicNode) => {
    const nodeToCopy = JSON.parse(JSON.stringify(node));
    setCopiedNode(nodeToCopy);
    setNotification('Nudo copiado al portapapeles.');
  };

  const handlePasteNode = () => {
    if (!activeProjectId || !activeCategoryId || !activeCategory || !copiedNode) return;

    let nextNum = 1;
    const allNodeIds = activeCategory.analyses.flatMap(a => a.result?.nodes.map(n => n.id) || []);
    const numbers = allNodeIds.flatMap(idStr => {
      const matches = idStr.match(/\d+/g);
      return matches ? matches.map(m => parseInt(m, 10)) : [];
    }).filter(n => !isNaN(n));

    if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;
    const formattedId = nextNum.toString().padStart(2, '0');

    const newNode: HydraulicNode = {
      ...copiedNode,
      id: formattedId,
      nodeName: `${copiedNode.nodeName} (Copia)`,
    };

    const pasteAnalysis: FileAnalysis = {
      id: generateId(),
      image: '',
      status: 'done',
      result: { nodes: [newNode], summary: `Copiado de Nudo ${copiedNode.id}` }
    };

    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? { ...c, analyses: [...c.analyses, pasteAnalysis] } : c)
    } : p));
    setNotification('Nudo pegado con éxito.');
  };


  // --- Manejo de Proyectos ---
  const handleOpenNewProject = () => {
    setIsEditingProject(false);
    setProjectForm({
      code: 'HDG-' + Math.floor(1000 + Math.random() * 9000),
      name: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      version: '1.0',
      stage: 'Ingeniería de Detalle',
      commune: '',
      region: ''
    });
    setShowProjectModal(true);
  };

  const handleOpenEditProject = (projectId: string) => {
    const p = projects.find(proj => proj.id === projectId);
    if (!p) return;
    setActiveProjectId(projectId);
    setProjectForm({ ...p });
    setIsEditingProject(true);
    setShowProjectModal(true);
  };

  const handleSaveProject = () => {
    if (!projectForm.name?.trim()) {
      alert("El nombre es obligatorio");
      return;
    }
    if (isEditingProject) {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, ...projectForm } as Project : p));
      setNotification('Proyecto actualizado.');
    } else {
      const project: Project = { ...projectForm as Project, id: generateId(), categories: [] };
      setProjects(prev => [...prev, project]);
      setActiveProjectId(project.id);
      setActiveCategoryId(null);
      setNotification('Proyecto creado.');
    }
    setShowProjectModal(false);
  };

  const handleImportProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (imported.id && imported.name && Array.isArray(imported.categories)) {
          const newProject = { ...imported, id: generateId() };
          setProjects(prev => [...prev, newProject]);
          setActiveProjectId(newProject.id);
          setNotification('Proyecto importado con éxito.');
        } else {
          throw new Error("Formato inválido");
        }
      } catch (err) {
        alert("El archivo no es un proyecto válido de Hidrogestión");
      }
    };
    reader.readAsText(file);
  };

  const handleExportProject = async (projectId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const projectToExport = projects.find(p => p.id === projectId);
    if (!projectToExport) return;

    const fileName = `PROYECTO_${projectToExport.name.replace(/\s+/g, '_')}_${projectToExport.code}.json`;
    const jsonString = JSON.stringify(projectToExport, null, 2);

    // @ts-ignore
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        setNotification('Archivo guardado correctamente.');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(err);
          setNotification('Error al guardar el archivo.');
        }
      }
    } else {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonString);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", fileName);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      setNotification('Archivo descargado correctamente.');
    }
    setShowSaveModal(false);
  };

  const handleExportLocal = () => {
    if (!activeProject) return;
    handleExportProject(activeProject.id);
  };

  const handleExportAPU = () => {
    if (!activeCategory) return;

    const materialData = new Map<string, {
      pieceMap: Map<string, {
        name: string;
        unit: string;
        quantity: number;
        price: number;
        totalWeight: number;
      }>,
      materialWeight: number
    }>();

    activeCategory.analyses.forEach(analysis => {
      analysis.result?.nodes.forEach(node => {
        const numericIds = node.id.match(/\d+/g) || [];
        const multiplier = numericIds.length || 1;

        node.pieces.forEach(p => {
          const normalizedName = p.name ? p.name.trim().toUpperCase() : '';
          const materialKey = p.material.toUpperCase();
          if (!materialData.has(materialKey)) {
            materialData.set(materialKey, { pieceMap: new Map(), materialWeight: 0 });
          }

          const mGroup = materialData.get(materialKey)!;
          const key = `${normalizedName}-${p.diameter}-${p.union || 'S/U'}`.toUpperCase();
          const existing = mGroup.pieceMap.get(key);

          const qty = p.quantity * multiplier;
          const individualWeight = p.weight || 0;
          const addedWeight = qty * individualWeight;

          mGroup.materialWeight += addedWeight;

          if (existing) {
            existing.quantity += qty;
            existing.totalWeight += addedWeight;
          } else {
            const lowerName = normalizedName.toLowerCase();
            let unit = "Un";
            if (lowerName.includes('tubo') || lowerName.includes('cañería')) unit = "m";
            else if (lowerName.includes('hormigón')) unit = "m3";

            let suggestedPrice = 0;
            const priceKey = Object.keys(SUGGESTED_PRICES).find(k => lowerName.includes(k.toLowerCase()));
            if (priceKey) suggestedPrice = SUGGESTED_PRICES[priceKey];

            mGroup.pieceMap.set(key, {
              name: `${normalizedName} ${p.diameter} ${p.union || ''}`.trim(),
              unit: unit,
              quantity: qty,
              price: suggestedPrice,
              totalWeight: addedWeight
            });
          }
        });
      });
    });

    if (materialData.size === 0) return alert("No hay piezas.");

    let csvContent = "\ufeff";
    const sortedMaterials = Array.from(materialData.keys()).sort();

    sortedMaterials.forEach(material => {
      const group = materialData.get(material)!;
      csvContent += `# --- BLOQUE MATERIAL: ${material} (Peso Total: ${group.materialWeight.toFixed(2)} kg) --- #\n`;
      csvContent += "Nombre;Unidad;Cantidad;Precio\n";

      Array.from(group.pieceMap.values()).forEach(item => {
        csvContent += `${item.name};${item.unit};${item.quantity};${item.price || ''}\n`;
      });
      csvContent += "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `APU_MATERIALES_${activeCategory.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setNotification('APU Exportado.');
  };

  const generateSummaryCSV = (nodes: HydraulicNode[], filename: string) => {
    if (nodes.length === 0) return alert("No hay nudos para exportar.");

    // Sort nodes by ID
    const expandedNodes: HydraulicNode[] = [];
    nodes.forEach(node => {
      const prefix = getPrefixLabel(node.type);
      const numericIds: string[] = node.id.match(/\d+/g) || [];
      if (numericIds.length > 0) {
        numericIds.forEach(individualId => {
          const formattedId = prefix ? `${prefix}-${parseInt(individualId, 10)}` : individualId.padStart(2, '0');
          expandedNodes.push({ ...node, id: formattedId });
        });
      } else {
        expandedNodes.push(node);
      }
    });

    expandedNodes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    const pieceDetailsMap = new Map<string, { name: string, material: string, diameter: string, union: string, weight: number }>();
    expandedNodes.forEach(node => {
      node.pieces.forEach(p => {
        const normalizedName = p.name ? p.name.trim().toUpperCase() : '';
        const key = `${p.material}|${normalizedName}|${p.union || 'S/U'}|${p.diameter}`;
        if (!pieceDetailsMap.has(key)) {
          const estimatedW = p.weight || getEstimatedWeight(normalizedName, p.diameter, p.material, catalogItems);
          pieceDetailsMap.set(key, {
            name: normalizedName,
            material: p.material,
            diameter: p.diameter,
            union: p.union || 'S/U',
            weight: estimatedW
          });
        } else {
          const current = pieceDetailsMap.get(key)!;
          if (p.weight && (current.weight === 0 || current.weight !== p.weight)) {
            current.weight = p.weight;
          }
        }
      });
    });

    const uniquePieceKeys = Array.from(pieceDetailsMap.keys()).sort((a, b) => {
      const matA = pieceDetailsMap.get(a)!.material;
      const matB = pieceDetailsMap.get(b)!.material;
      if (matA !== matB) return matA.localeCompare(matB);
      return a.localeCompare(b);
    });

    let csvContent = "\ufeff";
    csvContent += "ID Nudo;Nombre Nudo;";
    uniquePieceKeys.forEach(k => csvContent += `${pieceDetailsMap.get(k)?.material};`);
    csvContent += "TOTAL PIEZAS;ANCLAJE\n";

    csvContent += ";;";
    uniquePieceKeys.forEach(k => csvContent += `${pieceDetailsMap.get(k)?.name};`);
    csvContent += ";\n";

    csvContent += ";;";
    uniquePieceKeys.forEach(k => csvContent += `${pieceDetailsMap.get(k)?.diameter};`);
    csvContent += ";\n";

    const totalQuantitiesPerPiece = new Map<string, number>();
    uniquePieceKeys.forEach(k => totalQuantitiesPerPiece.set(k, 0));
    let grandTotalPieces = 0;
    let totalAnchorages = 0;

    expandedNodes.forEach(node => {
      csvContent += `${node.id};${node.nodeName};`;
      let rowSum = 0;
      uniquePieceKeys.forEach(k => {
        const found = node.pieces.find(p => {
          const pName = p.name ? p.name.trim().toUpperCase() : '';
          return `${p.material}|${pName}|${p.union || 'S/U'}|${p.diameter}` === k;
        });
        const qty = found ? found.quantity : 0;
        csvContent += `${qty || ''};`;
        rowSum += qty;
        totalQuantitiesPerPiece.set(k, totalQuantitiesPerPiece.get(k)! + qty);
      });
      csvContent += `${rowSum};${node.anchorageCount || 0}\n`;
      grandTotalPieces += rowSum;
      totalAnchorages += node.anchorageCount || 0;
    });

    csvContent += "\n";
    csvContent += "CANTIDAD TOTAL;;";
    uniquePieceKeys.forEach(k => {
      csvContent += `${totalQuantitiesPerPiece.get(k)};`;
    });
    csvContent += `${grandTotalPieces};${totalAnchorages}\n`;

    csvContent += "PESO UNITARIO (kg);;";
    uniquePieceKeys.forEach(k => {
      csvContent += `${pieceDetailsMap.get(k)?.weight.toString().replace('.', ',')};`;
    });
    csvContent += ";\n";

    csvContent += "PESO TOTAL (kg);;";
    let grandTotalWeight = 0;
    uniquePieceKeys.forEach(k => {
      const q = totalQuantitiesPerPiece.get(k)!;
      const w = pieceDetailsMap.get(k)?.weight || 0;
      const subTotalW = q * w;
      csvContent += `${subTotalW.toFixed(2).replace('.', ',')};`;
      grandTotalWeight += subTotalW;
    });
    csvContent += `${grandTotalWeight.toFixed(2).replace('.', ',')};\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setNotification('Tabla de Resumen Exportada.');
  };

  const handleExportSummaryTable = () => {
    if (!activeCategory) return;
    const rawNodes = activeCategory.analyses.flatMap(a => a.result?.nodes || []);
    generateSummaryCSV(rawNodes, `RESUMEN_PIEZAS_${activeCategory.name.replace(/\s+/g, '_')}.csv`);
  };

  const handleExportAnalysisTable = (analysisId: string) => {
    if (!activeCategory) return;
    const analysis = activeCategory.analyses.find(a => a.id === analysisId);
    if (!analysis || !analysis.result) return;

    // Fallback name if customName is missing, using ID or index if available (passed from card logic usually, but here we just use what we have)
    const namePart = analysis.customName || `Doc_${analysis.id.slice(0, 4)}`;
    generateSummaryCSV(analysis.result.nodes, `RESUMEN_PIEZAS_DOC_${namePart.replace(/\s+/g, '_')}.csv`);
  };

  const handleSaveToDrive = async () => {
    alert("Esta funcionalidad requiere configuración de API de Google Drive.");
    setShowSaveModal(false);
  };

  // --- Manejo de Biblioteca ---
  const handleExportLibrary = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(libraryNodes, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "BIBLIOTECA_ESTANDAR_HIDROGESTION.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setNotification('Biblioteca exportada.');
  };

  const handleImportLibrary = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (Array.isArray(imported)) {
          setLibraryNodes(prev => [...prev, ...imported]);
          setNotification('Biblioteca importada con éxito.');
        } else {
          throw new Error("Formato inválido");
        }
      } catch (err) {
        alert("El archivo no es un biblioteca válida");
      }
    };
    reader.readAsText(file);
  };

  // --- Manejo de Capítulos (Categorías) ---
  const handleAddCategory = (projectId: string) => {
    setActiveProjectId(projectId);
    setNewCategoryName('');
    setShowCategoryModal(true);
  };

  const handleMoveCategory = (projectId: string, categoryId: string, direction: 'up' | 'down') => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const index = p.categories.findIndex(c => c.id === categoryId);
      if (index === -1) return p;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= p.categories.length) return p;
      const newCats = [...p.categories];
      const [moved] = newCats.splice(index, 1);
      newCats.splice(newIndex, 0, moved);
      return { ...p, categories: newCats };
    }));
  };

  const handleSaveCategory = () => {
    if (!activeProjectId || !newCategoryName.trim()) return;
    const newCat: Category = { id: generateId(), name: newCategoryName.trim(), analyses: [] };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, categories: [...(p.categories || []), newCat] } : p));
    setActiveCategoryId(newCat.id);
    setShowCategoryModal(false);
    setNewCategoryName('');
    setNotification('Capítulo creado.');
  };

  const handleEditCategory = (projectId: string, categoryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const p = projects.find(proj => proj.id === projectId);
    const cat = p?.categories.find(c => c.id === categoryId);
    if (!cat) return;
    const newName = prompt('Nuevo nombre del capítulo:', cat.name);
    if (!newName) return;
    setProjects(prev => prev.map(p => p.id === projectId ? {
      ...p,
      categories: p.categories.map(c => c.id === categoryId ? { ...c, name: newName } : c)
    } : p));
  };

  const handleRemoveCategory = (projectId: string, categoryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const p = projects.find(x => x.id === projectId);
    const c = p?.categories.find(x => x.id === categoryId);
    if (c) setDeleteConfirm({ show: true, type: 'category', projectId, categoryId, name: c.name });
  };

  // --- Manejo de Análisis e IA ---
  const processAnalysis = async (analysisId: string) => {
    if (!activeProjectId || !activeCategoryId) return;
    if (credits <= 0) return alert("Sin créditos.");

    setProjects(prev => prev.map(p => ({
      ...p,
      categories: p.categories.map(c => ({
        ...c,
        analyses: c.analyses.map(a => a.id === analysisId ? { ...a, status: 'analyzing' as const } : a)
      }))
    })));

    try {
      const img = activeCategory?.analyses.find(a => a.id === analysisId)?.image;
      if (!img) throw new Error("Archivo no disponible");
      const result = await analyzeHydraulicPlan(img);
      setCredits(prev => Math.max(0, prev - 1));

      // Force sort node IDs after AI analysis
      if (result && result.nodes) {
        result.nodes = result.nodes.map(n => ({
          ...n,
          id: sortIdString(n.id)
        }));
      }

      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p,
        categories: p.categories.map(c => c.id === activeCategoryId ? {
          ...c,
          analyses: c.analyses.map(a => a.id === analysisId ? { ...a, status: 'done' as const, result } : a)
        } : c)
      } : p));
      setNotification('Análisis completado con éxito.');
    } catch (err) {
      setProjects(prev => prev.map(p => ({
        ...p,
        categories: p.categories.map(c => ({
          ...c,
          analyses: c.analyses.map(a => a.id === analysisId ? { ...a, status: 'error' as const, error: 'Error de análisis.' } : a)
        }))
      })));
    }
  };

  const handleImagesSelected = (base64List: string[]) => {
    if (!activeProjectId || !activeCategoryId) return;
    const newAnalyses: FileAnalysis[] = base64List.map(img => ({ id: generateId(), image: img, status: 'pending' }));
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? { ...c, analyses: [...c.analyses, ...newAnalyses] } : c)
    } : p));
  };

  const removeAnalysis = (analysisId: string) => {
    if (!activeProjectId || !activeCategoryId) return;
    setDeleteConfirm({ show: true, type: 'analysis', projectId: activeProjectId, analysisId, name: 'Análisis de Imagen' });
  };

  const handleUpdateAnalysisName = (analysisId: string, newName: string) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c,
        analyses: c.analyses.map(a => a.id === analysisId ? { ...a, customName: newName } : a)
      } : c)
    } : p));
  };

  const handleUpdateNode = (analysisId: string, nodeId: string, updates: Partial<HydraulicNode>) => {
    // If ID is being updated, force sort it
    if (updates.id) {
      updates.id = sortIdString(updates.id);
    }

    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c,
        analyses: c.analyses.map(a => a.id === analysisId ? {
          ...a,
          result: a.result ? { ...a.result, nodes: a.result.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n) } : undefined
        } : a)
      } : c)
    } : p));
  };

  const handleRemoveNode = (analysisId: string, nodeId: string) => {
    const analysis = activeCategory?.analyses.find(a => a.id === analysisId);
    const node = analysis?.result?.nodes.find(n => n.id === nodeId);
    setDeleteConfirm({ show: true, type: 'node', projectId: activeProjectId!, analysisId, nodeId, name: node?.nodeName || 'Nudo' });
  };

  const executeDeletion = () => {
    const { type, projectId, categoryId, analysisId, nodeId } = deleteConfirm;

    if (type === 'project') {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (activeProjectId === projectId) { setActiveProjectId(null); setActiveCategoryId(null); }
      setNotification('Proyecto eliminado.');
    } else if (type === 'category') {
      setProjects(prev => prev.map(p => p.id === projectId ? {
        ...p, categories: p.categories.filter(c => c.id !== categoryId)
      } : p));
      if (activeCategoryId === categoryId) setActiveCategoryId(null);
      setNotification('Capítulo eliminado.');
    } else if (type === 'analysis') {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p, categories: p.categories.map(c => c.id === activeCategoryId ? {
          ...c, analyses: c.analyses.filter(a => a.id !== analysisId)
        } : c)
      } : p));
      setNotification('Análisis eliminado.');
    } else if (type === 'node') {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p, categories: p.categories.map(c => c.id === activeCategoryId ? {
          ...c, analyses: c.analyses.map(a => a.id === analysisId ? {
            ...a, result: a.result ? { ...a.result, nodes: a.result.nodes.filter(n => n.id !== nodeId) } : undefined
          } : a)
        } : c)
      } : p));
    }
    setDeleteConfirm({ ...deleteConfirm, show: false });
  }; // Fixed: properly closed executeDeletion

  const [targetAnalysisId, setTargetAnalysisId] = useState<string | null>(null);

  const handleRequestAddNode = (analysisId: string) => {
    setTargetAnalysisId(analysisId);
    setShowAddNodeModal(true);
  };

  const handleAddNodeToAnalysis = (analysisId: string) => {
    if (!activeProjectId || !activeCategoryId) return;

    setProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;

      return {
        ...p,
        categories: p.categories.map(c => {
          if (c.id !== activeCategoryId) return c;

          return {
            ...c,
            analyses: c.analyses.map(a => {
              if (a.id !== analysisId) return a;

              // Calculate new ID based on existing nodes in this analysis or global context if needed
              const currentNodes = a.result?.nodes || [];
              const allNodeIds = currentNodes.map(n => n.id);

              let nextNum = 1;
              const numbers = allNodeIds.flatMap(idStr => {
                const matches = idStr.match(/\d+/g);
                return matches ? matches.map(m => parseInt(m, 10)) : [];
              }).filter(n => !isNaN(n));

              if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;

              const formattedId = nextNum.toString().padStart(2, '0');
              const newNode: HydraulicNode = {
                id: formattedId,
                nodeName: `Nudo Manual ${formattedId}`,
                type: 'Numerico',
                pieces: [],
                anchorageCount: 0
              };

              const newResult: AnalysisResult = a.result ? {
                ...a.result,
                nodes: [...a.result.nodes, newNode]
              } : {
                nodes: [newNode],
                summary: 'Análisis con nudos manuales'
              };

              return { ...a, result: newResult, status: 'done' as const };
            })
          };
        })
      };
    }));
    setNotification('Nudo agregado al documento.');
  };

  const handleSaveToLibrary = (node: HydraulicNode) => {
    const { id, ...rest } = node;
    const libNode: LibraryNode = { ...rest, libraryId: generateId() };
    setLibraryNodes(prev => [...prev, libNode]);
    setNotification('Nudo guardado en la biblioteca.');
  };

  const handleRemoveLibraryNode = (libraryId: string) => {
    setLibraryNodes(prev => prev.filter(n => n.libraryId !== libraryId));
    setNotification('Nudo eliminado de la biblioteca.');
  };

  const handleUpdateLibraryNode = (libraryId: string, updates: Partial<LibraryNode>) => {
    setLibraryNodes(prev => prev.map(n => (n.libraryId === libraryId ? { ...n, ...updates } : n)));
    setNotification('Nudo de biblioteca actualizado.');
  };

  const handleCreateEmptyNode = () => {
    if (!activeProjectId || !activeCategoryId || !activeCategory) return;

    // If targetAnalysisId is set, add to that analysis
    if (targetAnalysisId) {
      setProjects(prev => prev.map(p => {
        if (p.id !== activeProjectId) return p;
        return {
          ...p,
          categories: p.categories.map(c => {
            if (c.id !== activeCategoryId) return c;
            return {
              ...c,
              analyses: c.analyses.map(a => {
                if (a.id !== targetAnalysisId) return a;

                const currentNodes = a.result?.nodes || [];
                const allNodeIds = currentNodes.map(n => n.id);
                let nextNum = 1;
                const numbers = allNodeIds.flatMap(idStr => {
                  const matches = idStr.match(/\d+/g);
                  return matches ? matches.map(m => parseInt(m, 10)) : [];
                }).filter(n => !isNaN(n));
                if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;

                const formattedId = nextNum.toString().padStart(2, '0');
                const newNode: HydraulicNode = {
                  id: formattedId,
                  nodeName: `Nudo Manual ${formattedId}`,
                  type: 'Numerico',
                  pieces: [],
                  anchorageCount: 0,
                  isManual: true
                };

                const newResult: AnalysisResult = a.result ? {
                  ...a.result,
                  nodes: [...a.result.nodes, newNode]
                } : {
                  nodes: [newNode],
                  summary: 'Análisis con nudos manuales'
                };

                return { ...a, result: newResult, status: 'done' as const };
              })
            };
          })
        };
      }));
      setNotification('Nudo vacío agregado al documento.');
      setShowAddNodeModal(false);
      setTargetAnalysisId(null);
      return;
    }

    // Default behavior: Create new Manual Analysis
    let nextNum = 1;
    const allNodeIds = activeCategory.analyses.flatMap(a => a.result?.nodes.map(n => n.id) || []);
    const numbers = allNodeIds.flatMap(idStr => {
      const matches = idStr.match(/\d+/g);
      return matches ? matches.map(m => parseInt(m, 10)) : [];
    }).filter(n => !isNaN(n));
    if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;
    const formattedId = nextNum.toString().padStart(2, '0');
    const newNode: HydraulicNode = {
      id: formattedId,
      nodeName: `Nudo ${formattedId}`,
      type: 'Numerico',
      pieces: [],
      anchorageCount: 0,
      isManual: true
    };
    const manualAnalysis: FileAnalysis = { id: generateId(), image: '', status: 'done', result: { nodes: [newNode], summary: `Manual (N° ${formattedId})` } };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? { ...c, analyses: [...c.analyses, manualAnalysis] } : c)
    } : p));
    setNotification('Nudo manual creado.');
    setShowAddNodeModal(false);
  };

  const handleUseLibraryNode = (node: LibraryNode) => {
    if (!activeProjectId || !activeCategoryId || !activeCategory) return;

    // If targetAnalysisId is set, add to that analysis
    if (targetAnalysisId) {
      setProjects(prev => prev.map(p => {
        if (p.id !== activeProjectId) return p;
        return {
          ...p,
          categories: p.categories.map(c => {
            if (c.id !== activeCategoryId) return c;
            return {
              ...c,
              analyses: c.analyses.map(a => {
                if (a.id !== targetAnalysisId) return a;

                const currentNodes = a.result?.nodes || [];
                const allNodeIds = currentNodes.map(n => n.id);
                let nextNum = 1;
                const numbers = allNodeIds.flatMap(idStr => {
                  const matches = idStr.match(/\d+/g);
                  return matches ? matches.map(m => parseInt(m, 10)) : [];
                }).filter(n => !isNaN(n));
                if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;

                const formattedId = nextNum.toString().padStart(2, '0');
                const newNode: HydraulicNode = {
                  ...node,
                  id: formattedId,
                  isManual: true
                };

                const newResult: AnalysisResult = a.result ? {
                  ...a.result,
                  nodes: [...a.result.nodes, newNode]
                } : {
                  nodes: [newNode],
                  summary: 'Análisis con nudos manuales'
                };

                return { ...a, result: newResult, status: 'done' as const };
              })
            };
          })
        };
      }));
      setNotification('Nudo de biblioteca agregado al documento.');
      setShowLibraryModal(false);
      setTargetAnalysisId(null);
      return;
    }

    // Default behavior: Create new Analysis from Library Node
    let nextNum = 1;
    const allNodeIds = activeCategory.analyses.flatMap(a => a.result?.nodes.map(n => n.id) || []);
    const numbers = allNodeIds.flatMap(idStr => {
      const matches = idStr.match(/\d+/g);
      return matches ? matches.map(m => parseInt(m, 10)) : [];
    }).filter(n => !isNaN(n));
    if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;
    const formattedId = nextNum.toString().padStart(2, '0');

    const newNode: HydraulicNode = { ...node, id: formattedId, isManual: true };

    const newAnalysis: FileAnalysis = {
      id: generateId(),
      image: '',
      status: 'done',
      result: { nodes: [newNode], summary: `Desde Biblioteca: ${node.nodeName}` }
    };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? { ...c, analyses: [...c.analyses, newAnalysis] } : c)
    } : p));
    setShowLibraryModal(false);
    setNotification('Nudo importado de la biblioteca.');
  };

  const selectedMissingNodesObjectsGlobal = useMemo(() => {
    return missingNodesGlobal.filter(n => nodesToReportMissing.has(`${n.type}:${n.number}`));
  }, [missingNodesGlobal, nodesToReportMissing]);

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden font-['Inter']">
      <Sidebar
        projects={projects} activeProjectId={activeProjectId} activeCategoryId={activeCategoryId} isSidebarOpen={isSidebarOpen} credits={credits} initialCredits={INITIAL_CREDITS}
        onToggleProject={(id) => { setActiveProjectId(id === activeProjectId ? null : id); setActiveCategoryId(null); }}
        onSelectCategory={setActiveCategoryId} onOpenNewProject={handleOpenNewProject} onOpenEditProject={handleOpenEditProject}
        onDeleteProject={(pid, e) => { e.stopPropagation(); const p = projects.find(x => x.id === pid); if (p) setDeleteConfirm({ show: true, type: 'project', projectId: pid, name: p.name }); }}
        onExportProject={handleExportProject}
        onOpenLibrary={() => setShowLibraryModal(true)} onAddCategory={handleAddCategory} onEditCategory={handleEditCategory} onRemoveCategory={handleRemoveCategory}
        onImportProject={handleImportProject} onMoveCategory={handleMoveCategory} onOpenCatalog={() => setShowCatalogModal(true)}
      />

      <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`fixed top-1/2 -translate-y-1/2 z-40 w-8 h-20 bg-white border border-slate-200 rounded-r-2xl shadow-xl flex items-center justify-center text-[#004071] transition-all duration-300 hover:bg-[#004071] hover:text-white ${isSidebarOpen ? 'left-[320px]' : 'left-0'}`}>
        <i className={`fa-solid ${isSidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'} text-[10px]`}></i>
      </button>

      <main className="flex-grow flex flex-col overflow-hidden bg-[#f8fafc]">
        {activeProject ? (
          <>
            <header className="bg-white border-b border-slate-200 px-10 py-5 flex items-center justify-between z-20 shadow-sm shrink-0">
              <div className="flex flex-col">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black text-[#004071] uppercase tracking-tighter leading-none">{activeProject.name}</h2>
                  <button onClick={() => handleOpenEditProject(activeProject.id)} className="text-[#88C13E] hover:text-[#004071] transition-colors"><i className="fa-solid fa-pen-to-square text-sm"></i></button>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest bg-[#004071] px-2 py-1 rounded-md">{activeProject.code}</span>
                  {isAutoSaving && (
                    <span className="text-[8px] font-black text-[#88C13E] uppercase tracking-widest bg-[#88C13E]/10 px-2 py-1 rounded animate-pulse">
                      <i className="fa-solid fa-sync mr-1"></i> Auto-guardando
                    </span>
                  )}
                </div>
                {activeCategory && <div className="mt-2"><span className="text-[9px] font-black text-[#88C13E] uppercase tracking-widest bg-[#88C13E]/10 px-2 py-0.5 rounded-md">Capítulo: {activeCategory.name}</span></div>}
              </div>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#88C13E] transition-colors"></i>
                  <input type="text" placeholder="Buscar nudo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-6 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold text-[#004071] w-64 focus:bg-white focus:border-[#88C13E] outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowSaveModal(true)} className="px-6 py-3 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-[#002D50] transition-all">
                    <i className="fa-solid fa-cloud-arrow-up text-xs"></i> Guardar
                  </button>
                  {activeCategory && (
                    <div className="flex items-center gap-2">
                      <button onClick={handleExportSummaryTable} className="px-4 py-3 bg-[#88C13E] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 hover:bg-[#a6bf2e]">
                        <i className="fa-solid fa-table-list text-xs"></i> Tabla
                      </button>
                      <button onClick={handleExportAPU} className="px-4 py-3 bg-[#88C13E] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md flex items-center gap-2 hover:bg-[#a6bf2e]">
                        <i className="fa-solid fa-file-invoice-dollar text-xs"></i> APU
                      </button>
                    </div>
                  )}
                  <button
                    onClick={handlePasteNode}
                    disabled={!copiedNode || !activeCategoryId}
                    className="px-4 py-3 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 hover:bg-[#002D50] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <i className="fa-solid fa-paste text-xs"></i> Pegar
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-grow overflow-y-auto p-10">
              <div className="max-w-[1400px] mx-auto space-y-10">
                {!activeCategoryId ? (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center opacity-40">
                    <i className="fa-solid fa-tags text-6xl mb-6 text-[#004071]"></i>
                    <h3 className="text-xl font-black uppercase text-[#004071]">Selecciona un Capítulo</h3>
                  </div>
                ) : (
                  <div className="space-y-6 pb-20">
                    {/* SECCIÓN DE AUDITORÍA GLOBAL DEL CAPÍTULO */}
                    {isAnythingToReportGlobal && (
                      <div className="space-y-6 mb-10">
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
                                Auditoría Técnica de Capítulo (Global)
                                <i className={`fa-solid ${collapsedSections.audit ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
                              </h5>
                              {!collapsedSections.audit && (
                                <>
                                  <p className="text-xs text-blue-700 mb-4">
                                    Revisión consolidada de toda la planimetría de este capítulo. Genera una minuta técnica integral.
                                  </p>
                                  <ul className="list-disc list-inside text-xs text-blue-800 font-bold space-y-1">
                                    {unifiedNodesSummaryGlobal.length > 0 && <li>{unifiedNodesSummaryGlobal.length} esquema(s) repetido(s) detectados globalmente.</li>}
                                    {missingNodesGlobal.length > 0 && <li>{missingNodesGlobal.length} nudo(s) faltante(s) en la secuencia total.</li>}
                                  </ul>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setShowAuditReportModal(true); }}
                                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-xl text-[9px] font-black uppercase hover:shadow-lg transition-all self-start"
                                  >
                                    <i className="fa-solid fa-file-pdf mr-2"></i> Generar Minuta Global
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {unifiedNodesSummaryGlobal.length > 0 && !collapsedSections.audit && (
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
                                  Observación: Esquemas Repetidos en el Capítulo
                                  <i className={`fa-solid ${collapsedSections.schemes ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
                                </h5>
                                {!collapsedSections.schemes && (
                                  <div className="space-y-1.5 mt-2">
                                    {unifiedNodesSummaryGlobal.map((node, index) => (
                                      <p key={index} className="text-[10px] text-green-700 font-bold uppercase opacity-90 leading-relaxed">
                                        Para <span className="text-green-900 font-black">"{node.nodeName}"</span>, se detectaron dibujos idénticos para <span className="text-green-900 font-black">{formatIdsForDisplayGlobal((node.sourceGroupings || [])[0], node.type)}</span> y {(node.sourceGroupings || []).slice(1).map((group, i) => (
                                          <span key={i}>
                                            <span className="text-green-900 font-black">{formatIdsForDisplayGlobal(group as string, node.type)}</span>{i < (node.sourceGroupings?.length || 0) - 2 ? ' y ' : ''}
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

                        {missingNodesGlobal.length > 0 && !collapsedSections.audit && (
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
                                  Observación: Nudos Faltantes Globales
                                  <i className={`fa-solid ${collapsedSections.missing ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
                                </h5>
                                {!collapsedSections.missing && (
                                  <>
                                    <p className="text-xs text-sky-700 mb-4 uppercase font-bold opacity-70">Evaluación de saltos en la secuencia de todo el capítulo:</p>
                                    <div className="mb-6">
                                      <label
                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-sky-300 rounded-lg cursor-pointer hover:bg-sky-100 transition-colors font-black text-sky-900 text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={nodesToReportMissing.size === missingNodesGlobal.length}
                                          ref={el => { if (el) el.indeterminate = nodesToReportMissing.size > 0 && nodesToReportMissing.size < missingNodesGlobal.length; }}
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
                      </div>
                    )}

                    {activeCategory?.analyses.map((analysis, index) => (
                      <AnalysisCard
                        key={analysis.id}
                        analysis={{ ...analysis, documentNumber: index + 1 }} // Assign index here
                        onProcess={processAnalysis}
                        onRemove={removeAnalysis}
                        onUpdateAnalysisName={handleUpdateAnalysisName}
                        onUpdateNode={handleUpdateNode}
                        onRemoveNode={handleRemoveNode}
                        onSaveToLibrary={handleSaveToLibrary}
                        onAddNode={handleRequestAddNode}
                        searchTerm={searchTerm}
                        duplicateIds={chapterDuplicateIds}
                        credits={credits}
                        onCopyNode={handleCopyNode}
                        activeProject={activeProject}
                        onExportTable={handleExportAnalysisTable}
                      />
                    ))}
                    <div className="pt-10 border-t border-slate-200 flex flex-col items-center">
                      <FileUploader onImagesSelected={handleImagesSelected} loading={false} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center">
            <h1 className="text-6xl font-[1000] text-[#004071] uppercase tracking-tighter text-center leading-[0.85]">HIDROGESTIÓN <br /> <span className="text-[#88C13E]">GESTOR DE NUDOS</span></h1>
            <button onClick={handleOpenNewProject} className="mt-16 px-20 py-6 bg-[#004071] text-white rounded-[2.5rem] font-black uppercase tracking-[0.4em] shadow-2xl transition-all scale-110 hover:bg-[#88C13E]">NUEVO PROYECTO</button>
          </div>
        )}

        {notification && (
          <div className="fixed bottom-6 right-6 bg-[#004071] border-l-4 border-[#88C13E] text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-right duration-500 z-[300]">
            <div className="w-8 h-8 bg-[#88C13E] rounded-full flex items-center justify-center">
              <i className="fa-solid fa-check text-xs"></i>
            </div>
            <span className="text-xs font-black uppercase tracking-widest">{notification}</span>
          </div>
        )}

        {showAddNodeModal && (
          <AddNodeModal
            onClose={() => setShowAddNodeModal(false)}
            onCreateEmpty={handleCreateEmptyNode}
            onOpenLibrary={() => setShowLibraryModal(true)}
          />
        )}

        {/* Modal de Opciones de Guardado */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-[#002d50]/90 backdrop-blur-md z-[250] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="px-10 py-8 bg-[#f8fafc] border-b flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black text-[#004071] uppercase tracking-tighter">Opciones de Guardado</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Tu progreso está seguro</p>
                </div>
                <button onClick={() => setShowSaveModal(false)} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <i className="fa-solid fa-xmark text-slate-400"></i>
                </button>
              </div>
              <div className="p-10 space-y-6">
                <div className="p-6 bg-green-50 border border-green-100 rounded-3xl flex items-start gap-4">
                  <div className="w-10 h-10 bg-[#88C13E] text-white rounded-xl flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-bolt"></i>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-green-900 uppercase">Guardado Automático Activo</h4>
                    <p className="text-xs text-green-700 mt-1">Todos los cambios se están guardando localmente en la memoria de este navegador automáticamente.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button
                    onClick={handleExportLocal}
                    className="w-full flex items-center gap-6 p-6 bg-slate-50 hover:bg-white border-2 border-slate-100 hover:border-[#004071] rounded-[2rem] text-left transition-all group"
                  >
                    <div className="w-14 h-14 bg-white shadow-md rounded-2xl flex items-center justify-center text-[#004071] group-hover:scale-110 transition-transform">
                      <i className="fa-solid fa-file-export text-xl"></i>
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-[#004071] uppercase">Descargar Copia de Seguridad</h4>
                      <p className="text-xs text-slate-400">Guarda un archivo .json en tu ordenador para moverlo a otro equipo.</p>
                    </div>
                  </button>

                  <button
                    onClick={handleSaveToDrive}
                    className="w-full flex items-center gap-6 p-6 bg-slate-50 opacity-60 border-2 border-slate-100 rounded-[2rem] text-left cursor-not-allowed"
                  >
                    <div className="w-14 h-14 bg-white shadow-md rounded-2xl flex items-center justify-center text-[#4285F4]">
                      <i className="fa-brands fa-google-drive text-xl"></i>
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-400 uppercase">Google Drive (Próximamente)</h4>
                      <p className="text-xs text-slate-300">Sincroniza tus proyectos directamente en la nube.</p>
                    </div>
                  </button>
                </div>
              </div>
              <div className="px-10 py-6 bg-slate-50 flex justify-end">
                <button onClick={() => setShowSaveModal(false)} className="px-10 py-3 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-[#88C13E] transition-all">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {showLibraryModal && (
          <LibraryModal
            nodes={libraryNodes}
            onClose={() => setShowLibraryModal(false)}
            onUseNode={handleUseLibraryNode}
            isCategoryActive={!!activeCategoryId}
            onUpdateNode={handleUpdateLibraryNode}
            onRemoveNode={handleRemoveLibraryNode}
            onExportLibrary={handleExportLibrary}
            onImportLibrary={handleImportLibrary}
          />
        )}

        {deleteConfirm.show && (
          <div className="fixed inset-0 bg-[#002d50]/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl text-center">
              <i className="fa-solid fa-triangle-exclamation text-red-600 text-4xl mb-6"></i>
              <h2 className="text-xl font-black text-[#004071] uppercase mb-3">¿Confirmar Acción?</h2>
              <p className="text-sm text-slate-500 mb-8">Desea eliminar definitivamente: <b>"{deleteConfirm.name}"</b>. Esta acción borrará todos los datos asociados.</p>
              <div className="flex flex-col gap-3">
                <button onClick={executeDeletion} className="w-full py-4 bg-red-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest">Sí, eliminar definitivamente</button>
                <button onClick={() => setDeleteConfirm({ ...deleteConfirm, show: false })} className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {showProjectModal && (
          <div className="fixed inset-0 bg-[#002d50]/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95">
              <div className="px-10 py-6 border-b flex justify-between items-center">
                <h2 className="text-xl font-black text-[#004071] uppercase">Proyecto</h2>
                <button onClick={() => setShowProjectModal(false)}><i className="fa-solid fa-xmark text-slate-300"></i></button>
              </div>
              <div className="p-10 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Código</label>
                    <input type="text" value={projectForm.code} onChange={e => setProjectForm({ ...projectForm, code: e.target.value })} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm font-black text-[#004071]" />
                  </div>
                  <div className="col-span-2 flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</label>
                    <input type="text" value={projectForm.name} onChange={e => setProjectForm({ ...projectForm, name: e.target.value })} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm font-black text-[#004071]" />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</label>
                  <textarea value={projectForm.description} onChange={e => setProjectForm({ ...projectForm, description: e.target.value })} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm font-bold text-[#004071] h-20 resize-none"></textarea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Etapa</label>
                    <input type="text" value={projectForm.stage} onChange={e => setProjectForm({ ...projectForm, stage: e.target.value })} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm font-bold text-[#004071]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Versión</label>
                    <input type="text" value={projectForm.version} onChange={e => setProjectForm({ ...projectForm, version: e.target.value })} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm font-bold text-[#004071]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                    <input type="date" value={projectForm.date} onChange={e => setProjectForm({ ...projectForm, date: e.target.value })} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm font-bold text-[#004071]" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Región</label>
                    <input type="text" value={projectForm.region} onChange={e => setProjectForm({ ...projectForm, region: e.target.value })} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm font-bold text-[#004071]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comuna</label>
                    <input type="text" value={projectForm.commune} onChange={e => setProjectForm({ ...projectForm, commune: e.target.value })} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm font-bold text-[#004071]" />
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <button onClick={() => setShowProjectModal(false)} className="px-6 py-4 text-xs font-black uppercase text-slate-400">Cancelar</button>
                  <button onClick={handleSaveProject} className="px-12 py-4 bg-[#004071] text-white rounded-2xl text-xs font-black uppercase shadow-lg hover:bg-[#88C13E]">Guardar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCategoryModal && (
          <div className="fixed inset-0 bg-[#002d50]/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl text-center">
              <h2 className="text-lg font-black text-[#004071] uppercase mb-4">Capítulo</h2>
              <input type="text" placeholder="Ej. Impulsión..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} className="w-full bg-slate-50 border p-5 rounded-2xl mb-8 font-black text-[#004071]" autoFocus />
              <div className="flex justify-center gap-6">
                <button onClick={() => setShowCategoryModal(false)} className="text-xs font-black text-slate-400 uppercase">Cancelar</button>
                <button onClick={handleSaveCategory} className="px-10 py-4 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase">Crear</button>
              </div>
            </div>
          </div>
        )}

        {showAuditReportModal && activeProject && (
          <AuditReportModal
            project={activeProject}
            repeatedNodes={unifiedNodesSummaryGlobal}
            missingNodes={selectedMissingNodesObjectsGlobal}
            onClose={() => setShowAuditReportModal(false)}
          />
        )}
      </main>

      <CatalogModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        catalogItems={catalogItems}
        onUpdateCatalog={(items) => {
          setCatalogItems(items);
          setNotification('Catálogo de piezas actualizado exitosamente');
        }}
      />
    </div>
  );
};
export default App;

