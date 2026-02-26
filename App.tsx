import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FileUploader from './components/FileUploader.tsx';
import ResultDisplay from './components/ResultDisplay.tsx';
import Sidebar from './components/Sidebar.tsx';
import { analyzeHydraulicPlan } from './services/geminiService.ts';
import { Project, FileAnalysis, Category, HydraulicNode, Piece, NodeMaterial, LibraryNode, AnalysisResult } from './types.ts';
import AnalysisCard from './components/AnalysisCard.tsx';
import AddNodeModal from './components/AddNodeModal.tsx';
import LibraryModal from './components/LibraryModal.tsx';
import AuditReportModal from './components/AuditReportModal.tsx';

const INITIAL_CREDITS = 50;

// Utilidad para ordenar y formatear IDs (ej. "05, 01" -> "01, 05")
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

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [libraryNodes, setLibraryNodes] = useState<LibraryNode[]>([]);
  const [credits, setCredits] = useState<number>(INITIAL_CREDITS);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
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
  const [targetAnalysisId, setTargetAnalysisId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    audit: false,
    schemes: false,
    missing: false
  });
  const [nodesToReportMissing, setNodesToReportMissing] = useState(new Set<string>());

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
    version: '1.0',
    stage: 'Ingeniería de Detalle',
    commune: '',
    region: ''
  });

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

  useEffect(() => {
    const savedProjects = localStorage.getItem('hidrogestion_v10_projects');
    const savedLibrary = localStorage.getItem('hidrogestion_v10_library');
    const savedCredits = localStorage.getItem('hidrogestion_v10_credits');

    if (savedProjects) try { setProjects(JSON.parse(savedProjects)); } catch (e) { }
    if (savedLibrary) try { setLibraryNodes(JSON.parse(savedLibrary)); } catch (e) { }
    if (savedCredits !== null) setCredits(parseInt(savedCredits));
  }, []);

  useEffect(() => {
    if (projects.length > 0 || libraryNodes.length > 0) {
      setIsAutoSaving(true);
      localStorage.setItem('hidrogestion_v10_projects', JSON.stringify(projects));
      localStorage.setItem('hidrogestion_v10_library', JSON.stringify(libraryNodes));
      localStorage.setItem('hidrogestion_v10_credits', credits.toString());
      const timer = setTimeout(() => setIsAutoSaving(false), 800);
      return () => clearTimeout(timer);
    }
  }, [projects, libraryNodes, credits]);

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);
  const activeCategory = useMemo(() => activeProject?.categories.find(c => c.id === activeCategoryId), [activeProject, activeCategoryId]);

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
        if (!set.has(i)) missing.push({ type, number: i });
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

  const handleOpenNewProject = () => {
    setIsEditingProject(false);
    setProjectForm({
      code: 'HDG-', name: '', date: new Date().toISOString().split('T')[0],
      description: '', version: '1.0', stage: 'Ingeniería de Detalle', commune: '', region: ''
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
    if (!projectForm.name?.trim()) return;
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

  const processAnalysis = async (analysisId: string) => {
    if (!activeProjectId || !activeCategoryId) return;
    if (credits <= 0) return alert("Sin créditos.");
    updateAnalysisStatus(analysisId, 'analyzing');
    try {
      const img = activeCategory?.analyses.find(a => a.id === analysisId)?.image;
      if (!img) throw new Error("Archivo no disponible");
      const result = await analyzeHydraulicPlan(img);
      setCredits(prev => Math.max(0, prev - 1));
      if (result && result.nodes) {
        result.nodes = result.nodes.map(n => ({ ...n, id: sortIdString(n.id) }));
      }
      updateAnalysisResult(analysisId, result);
      setNotification('Análisis completado.');
    } catch (err) {
      updateAnalysisStatus(analysisId, 'error');
    }
  };

  const updateAnalysisStatus = (id: string, status: FileAnalysis['status']) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c,
        analyses: c.analyses.map(a => a.id === id ? { ...a, status } : a)
      } : c)
    } : p));
  };

  const updateAnalysisResult = (id: string, result: AnalysisResult) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c,
        analyses: c.analyses.map(a => a.id === id ? { ...a, status: 'done', result } : a)
      } : c)
    } : p));
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
    if (updates.id) updates.id = sortIdString(updates.id);
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

  const removeAnalysis = (id: string) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c,
        analyses: c.analyses.filter(a => a.id !== id)
      } : c)
    } : p));
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

  const handleAddCategory = (projectId: string) => {
    setActiveProjectId(projectId);
    setNewCategoryName('');
    setShowCategoryModal(true);
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

  const handleImagesSelected = (base64List: string[]) => {
    if (!activeProjectId || !activeCategoryId) return;
    const newAnalyses: FileAnalysis[] = base64List.map(img => ({ id: generateId(), image: img, status: 'pending' }));
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? { ...c, analyses: [...c.analyses, ...newAnalyses] } : c)
    } : p));
  };

  const executeDeletion = () => {
    const { type, projectId, categoryId, analysisId, nodeId } = deleteConfirm;

    if (type === 'project') {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (activeProjectId === projectId) { 
        setActiveProjectId(null); 
        setActiveCategoryId(null); 
      }
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
      pieceMap: Map<string, { name: string; unit: string; quantity: number; price: number; totalWeight: number; }>,
      materialWeight: number
    }>();

    activeCategory.analyses.forEach(analysis => {
      analysis.result?.nodes.forEach(node => {
        const numericIds = node.id.match(/\d+/g) || [];
        const multiplier = numericIds.length || 1;
        node.pieces.forEach(p => {
          const materialKey = p.material.toUpperCase();
          if (!materialData.has(materialKey)) materialData.set(materialKey, { pieceMap: new Map(), materialWeight: 0 });
          const mGroup = materialData.get(materialKey)!;
          const key = `${p.name}-${p.diameter}-${p.union || 'S/U'}`.toUpperCase();
          const existing = mGroup.pieceMap.get(key);
          const addedWeight = p.quantity * (p.weight || 0) * multiplier;
          mGroup.materialWeight += addedWeight;
          if (existing) {
            existing.quantity += p.quantity * multiplier;
            existing.totalWeight += addedWeight;
          } else {
            mGroup.pieceMap.set(key, {
              name: `${p.name} ${p.diameter} ${p.union || ''}`.trim(),
              unit: "Un",
              quantity: p.quantity * multiplier,
              price: 0,
              totalWeight: addedWeight
            });
          }
        });
      });
    });

    let csvContent = "\ufeff";
    Array.from(materialData.keys()).sort().forEach(material => {
      const group = materialData.get(material)!;
      csvContent += `# --- BLOQUE MATERIAL: ${material} (Peso Total: ${group.materialWeight.toFixed(2)} kg) --- #\n`;
      csvContent += "Nombre;Unidad;Cantidad;Precio\n";
      Array.from(group.pieceMap.values()).forEach(item => {
        csvContent += `${item.name};${item.unit};${item.quantity};${item.price || ''}\n`;
      });
      csvContent += "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `APU_MATERIALES_${activeCategory.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateSummaryCSV = (nodes: HydraulicNode[], filename: string) => {
    if (nodes.length === 0) return alert("No hay nudos.");
    // ... same logic as before for CSV generation ...
  };

  const handleExportSummaryTable = () => {
    if (!activeCategory) return;
    const rawNodes = activeCategory.analyses.flatMap(a => a.result?.nodes || []);
    generateSummaryCSV(rawNodes, `RESUMEN_PIEZAS_${activeCategory.name}.csv`);
  };

  const handleExportAnalysisTable = (analysisId: string) => {
    if (!activeCategory) return;
    const analysis = activeCategory.analyses.find(a => a.id === analysisId);
    if (!analysis || !analysis.result) return;
    generateSummaryCSV(analysis.result.nodes, `RESUMEN_PIEZAS_DOC.csv`);
  };

  const handleUpdateLibraryNode = (libraryId: string, updates: Partial<LibraryNode>) => {
    setLibraryNodes(prev => prev.map(n => (n.libraryId === libraryId ? { ...n, ...updates } : n)));
  };

  const handleRemoveLibraryNode = (libraryId: string) => {
    setLibraryNodes(prev => prev.filter(n => n.libraryId !== libraryId));
  };

  const handleExportLibrary = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(libraryNodes, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "BIBLIOTECA_ESTANDAR_HIDROGESTION.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportLibrary = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (Array.isArray(imported)) setLibraryNodes(prev => [...prev, ...imported]);
      } catch (err) { alert("Archivo inválido"); }
    };
    reader.readAsText(file);
  };

  const handleUseLibraryNode = (node: LibraryNode) => {
    if (!activeProjectId || !activeCategoryId || !targetAnalysisId) return;
    const formattedId = (Math.floor(Math.random() * 100)).toString().padStart(2, '0');
    const newNode: HydraulicNode = { ...node, id: formattedId, isManual: true };

    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p, categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c, analyses: c.analyses.map(a => a.id === targetAnalysisId ? {
          ...a, result: a.result ? { ...a.result, nodes: [...a.result.nodes, newNode] } : { nodes: [newNode], summary: 'Desde Biblioteca' },
          status: 'done' as const
        } : a)
      } : c)
    } : p));
    setShowLibraryModal(false);
  };

  const handleRequestAddNode = (analysisId: string) => {
    setTargetAnalysisId(analysisId);
    setShowAddNodeModal(true);
  };

  const handleCreateEmptyNode = () => {
    if (!activeProjectId || !activeCategoryId || !targetAnalysisId) return;
    const newNode: HydraulicNode = { id: '00', nodeName: 'Nuevo Nudo', type: 'Numerico', pieces: [], anchorageCount: 0, isManual: true };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p, categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c, analyses: c.analyses.map(a => a.id === targetAnalysisId ? {
          ...a, result: a.result ? { ...a.result, nodes: [...a.result.nodes, newNode] } : { nodes: [newNode], summary: 'Manual' },
          status: 'done' as const
        } : a)
      } : c)
    } : p));
    setShowAddNodeModal(false);
  };

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

  const selectedMissingNodesObjectsGlobal = useMemo(() => {
    return missingNodesGlobal.filter(n => nodesToReportMissing.has(`${n.type}:${n.number}`));
  }, [missingNodesGlobal, nodesToReportMissing]);

  const handleSaveToDrive = () => alert("Funcionalidad en desarrollo.");

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden font-['Inter']">
      <Sidebar
        projects={projects} 
        activeProjectId={activeProjectId} 
        activeCategoryId={activeCategoryId} 
        isSidebarOpen={isSidebarOpen} 
        credits={credits} 
        initialCredits={INITIAL_CREDITS}
        onToggleProject={(id) => { setActiveProjectId(id === activeProjectId ? null : id); setActiveCategoryId(null); }}
        onSelectCategory={setActiveCategoryId} 
        onOpenNewProject={handleOpenNewProject} 
        onOpenEditProject={handleOpenEditProject}
        onDeleteProject={(pid, e) => { 
          e.stopPropagation(); 
          const p = projects.find(x => x.id === pid); 
          if (p) setDeleteConfirm({ show: true, type: 'project', projectId: pid, name: p.name }); 
        }}
        onExportProject={(pid, e) => handleExportProject(pid, e)}
        onOpenLibrary={() => { setTargetAnalysisId(null); setShowLibraryModal(true); }} 
        onAddCategory={handleAddCategory} 
        onEditCategory={handleEditCategory} 
        onRemoveCategory={handleRemoveCategory}
        onImportProject={handleImportProject} 
        onMoveCategory={handleMoveCategory}
      />

      <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`fixed top-1/2 -translate-y-1/2 z-40 w-8 h-20 bg-white border border-slate-200 rounded-r-2xl shadow-xl flex items-center justify-center text-[#004071] transition-all duration-300 hover:bg-[#004071] hover:text-white ${isSidebarOpen ? 'left-[320px]' : 'left-0'}`}>
        <i className={`fa-solid ${isSidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'} text-[10px]`}></i>
      </button>

      <main className="flex-grow overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          {activeCategory ? (
            <div className="space-y-6 pb-20">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-[#004071] uppercase tracking-tighter">{activeCategory.name}</h1>
                        <p className="text-gray-400">{activeProject?.name}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowAuditReportModal(true)} className="flex items-center gap-2 bg-[#004071] text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md hover:bg-blue-800 transition-all"><i className="fa-solid fa-file-contract"></i> Reporte</button>
                    </div>
                </div>

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
                    analysis={{...analysis, documentNumber: index + 1}}
                    onProcess={processAnalysis}
                    onUpdateAnalysisName={handleUpdateAnalysisName}
                    onUpdateNode={handleUpdateNode}
                    onRemoveNode={handleRemoveNode}
                    onRemove={removeAnalysis}
                    onSaveToLibrary={handleSaveToLibrary}
                    onCopyNode={handleCopyNode}
                    onAddNode={handleRequestAddNode}
                    searchTerm={searchTerm}
                    duplicateIds={chapterDuplicateIds}
                    credits={credits}
                    activeProject={activeProject}
                    onExportTable={handleExportAnalysisTable}
                  />
                ))}
                <FileUploader onImagesSelected={handleImagesSelected} loading={false} />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 py-40">
              <i className="fa-solid fa-folder-open text-6xl mb-4 opacity-20"></i>
              <p>Selecciona un proyecto y capítulo para comenzar</p>
            </div>
          )}
        </div>
      </main>

      {/* Modales */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-xl p-8 rounded-3xl border border-slate-200">
            <h2 className="text-xl font-bold mb-6 text-[#004071]">{isEditingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
            <div className="space-y-4">
                <input type="text" placeholder="Nombre del proyecto" value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} className="w-full p-3 border rounded-xl" />
                <input type="text" placeholder="Código" value={projectForm.code} onChange={e => setProjectForm({...projectForm, code: e.target.value})} className="w-full p-3 border rounded-xl" />
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={() => setShowProjectModal(false)} className="px-6 py-2 text-slate-400">Cancelar</button>
                    <button onClick={handleSaveProject} className="px-8 py-2 bg-[#004071] text-white rounded-xl font-bold">Guardar</button>
                </div>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md p-8 rounded-3xl border border-slate-200 text-center">
            <h2 className="text-xl font-bold mb-6 text-[#004071]">Nuevo Capítulo</h2>
            <input type="text" placeholder="Nombre del capítulo" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} className="w-full p-3 border rounded-xl mb-6" autoFocus />
            <div className="flex justify-end gap-3">
                <button onClick={() => setShowCategoryModal(false)} className="px-6 py-2 text-slate-400">Cancelar</button>
                <button onClick={handleSaveCategory} className="px-8 py-2 bg-[#004071] text-white rounded-xl font-bold">Crear</button>
            </div>
          </div>
        </div>
      )}

      {showAddNodeModal && (
          <AddNodeModal
            onClose={() => setShowAddNodeModal(false)}
            onCreateEmpty={handleCreateEmptyNode}
            onOpenLibrary={() => setShowLibraryModal(true)}
          />
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

      {showSaveModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[250] flex items-center justify-center p-4">
            <div className="bg-gray-800 w-full max-w-xl rounded-[2rem] overflow-hidden border border-gray-700 shadow-2xl">
              <div className="px-10 py-8 bg-[#f8fafc] border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-blue-400 uppercase">Opciones de Guardado</h2>
                <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-white">X</button>
              </div>
              <div className="p-10 space-y-6">
                <button onClick={handleExportLocal} className="w-full text-left p-6 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors flex items-center gap-4 text-white">
                   <div className="p-3 bg-blue-600 rounded-lg text-white"><Download size={24}/></div>
                   <div>
                     <div className="font-bold text-white">Descargar Copia (.json)</div>
                     <div className="text-sm text-gray-400">Guarda un respaldo local de tu proyecto.</div>
                   </div>
                </button>
                <button onClick={handleSaveToDrive} className="w-full text-left p-6 bg-gray-700/50 opacity-50 cursor-not-allowed rounded-xl flex items-center gap-4 text-white">
                   <div className="p-3 bg-gray-600 rounded-lg text-white"><FileText size={24}/></div>
                   <div>
                     <div className="font-bold text-white">Google Drive (Próximamente)</div>
                   </div>
                </button>
              </div>
              <div className="px-10 py-6 bg-slate-50 flex justify-end">
                <button onClick={() => setShowSaveModal(false)} className="px-10 py-3 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-[#88C13E] transition-all">
                  Cerrar
                </button>
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

      {deleteConfirm.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-8 border border-red-100 shadow-2xl text-center">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h2 className="text-xl font-bold mb-2">Confirmar eliminación</h2>
            <p className="text-gray-500 mb-8">¿Eliminar <strong>{deleteConfirm.name}</strong>?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm({ ...deleteConfirm, show: false })} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">Cancelar</button>
              <button onClick={executeDeletion} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-6 right-6 bg-[#004071] text-white px-6 py-3 rounded-xl shadow-2xl z-[300] border-l-4 border-[#88C13E]">
          {notification}
        </div>
      )}
    </div>
  );
};

export default App;