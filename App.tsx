
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FileUploader from './components/FileUploader';
import ResultDisplay from './components/ResultDisplay';
import Sidebar from './components/Sidebar';
import { analyzeHydraulicPlan } from './services/geminiService';
import { Project, FileAnalysis, Category, HydraulicNode, Piece, NodeMaterial, LibraryNode } from './types';
import AnalysisCard from './components/AnalysisCard';
import AddNodeModal from './components/AddNodeModal';
import LibraryModal from './components/LibraryModal';

const INITIAL_CREDITS = 50;

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

const getEstimatedWeight = (name: string, diameter: string, material: string): number => {
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


/**
 * Componente Principal de la Aplicación
 * Gestiona el estado global de proyectos, navegación y persistencia de datos.
 */
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

  // Efecto para la notificación
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Estado para la confirmación de borrado
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
    code: 'HDG-' + Math.floor(1000 + Math.random() * 9000),
    name: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    version: '1.0',
    stage: 'Ingeniería de Detalle',
    commune: '',
    region: ''
  });

  useEffect(() => {
    const savedProjects = localStorage.getItem('hidrogestion_v10_projects');
    const savedLibrary = localStorage.getItem('hidrogestion_v10_library');
    const savedCredits = localStorage.getItem('hidrogestion_v10_credits');

    if (savedProjects) try { setProjects(JSON.parse(savedProjects)); } catch (e) { }
    if (savedLibrary) try { setLibraryNodes(JSON.parse(savedLibrary)); } catch (e) { }
    if (savedCredits !== null) setCredits(parseInt(savedCredits));
  }, []);

  useEffect(() => {
    localStorage.setItem('hidrogestion_v10_projects', JSON.stringify(projects));
    localStorage.setItem('hidrogestion_v10_library', JSON.stringify(libraryNodes));
    localStorage.setItem('hidrogestion_v10_credits', credits.toString());
  }, [projects, libraryNodes, credits]);

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);
  const activeCategory = useMemo(() => activeProject?.categories.find(c => c.id === activeCategoryId), [activeProject, activeCategoryId]);

  const chapterDuplicateIds = useMemo(() => {
    if (!activeCategory) return new Set<string>();
    const idCount = new Map<string, number>();
    const duplicates = new Set<string>();
    activeCategory.analyses.forEach(analysis => {
      analysis.result?.nodes.forEach(node => {
        const ids = node.id.split(',').map(s => s.trim().toLowerCase());
        ids.forEach(id => {
          if (id) {
            idCount.set(id, (idCount.get(id) || 0) + 1);
            if (idCount.get(id)! > 1) duplicates.add(id);
          }
        });
      });
    });
    return duplicates;
  }, [activeCategory]);
  
  const handleCopyNode = (node: HydraulicNode) => {
    const nodeToCopy = JSON.parse(JSON.stringify(node));
    setCopiedNode(nodeToCopy);
    setNotification('Nudo copiado al portapapeles.');
  };

  const handlePasteNode = () => {
    if (!activeProjectId || !activeCategoryId || !activeCategory || !copiedNode) return;
    
    let nextNum = 1;
    const allNodeIds = activeCategory.analyses.flatMap(a => a.result?.nodes.map(n => n.id) || []);
    const numbers = allNodeIds.flatMap(idStr => idStr.split(',').map(s => {
      const match = s.trim().match(/\d+/);
      return match ? parseInt(match[0]) : NaN;
    }).filter(n => !isNaN(n)));
    
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
  };


  // --- Manejo de Proyectos ---
  const handleOpenNewProject = () => {
    setIsEditingProject(false);
    setProjectForm({
      code: 'HDG-' + Math.floor(1000 + Math.random() * 9000),
      name: '',
      date: new Date().toISOString().split('T')[0],
      version: '1.0',
      description: '',
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
    } else {
      const project: Project = { ...projectForm as Project, id: generateId(), categories: [] };
      setProjects(prev => [...prev, project]);
      setActiveProjectId(project.id);
      setActiveCategoryId(null);
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
          alert("Proyecto importado exitosamente");
        } else {
          throw new Error("Formato inválido");
        }
      } catch (err) {
        alert("El archivo no es un proyecto válido de Hidrogestión");
      }
    };
    reader.readAsText(file);
  };

  const handleExportProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const projectToExport = projects.find(p => p.id === projectId);
    if (!projectToExport) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectToExport, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `PROYECTO_${projectToExport.name.replace(/\s+/g, '_')}_${projectToExport.code}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleExportLocal = () => {
    if (!activeProject) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeProject));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `NUDOS_${activeProject.name.replace(/\s+/g, '_')}_${activeProject.code}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setShowSaveModal(false);
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
        const ids = node.id.split(',').map(s => s.trim()).filter(Boolean);
        const multiplier = ids.length;

        node.pieces.forEach(p => {
          const materialKey = p.material.toUpperCase();
          if (!materialData.has(materialKey)) {
            materialData.set(materialKey, { pieceMap: new Map(), materialWeight: 0 });
          }

          const mGroup = materialData.get(materialKey)!;
          const key = `${p.name}-${p.diameter}-${p.union || 'S/U'}`.toUpperCase();
          const existing = mGroup.pieceMap.get(key);

          const qty = p.quantity * multiplier;
          const individualWeight = p.weight || 0;
          const addedWeight = qty * individualWeight;

          mGroup.materialWeight += addedWeight;

          if (existing) {
            existing.quantity += qty;
            existing.totalWeight += addedWeight;
          } else {
            const lowerName = p.name.toLowerCase();
            let unit = "Un";
            if (lowerName.includes('tubo') || lowerName.includes('cañería')) unit = "m";
            else if (lowerName.includes('hormigón')) unit = "m3";

            let suggestedPrice = 0;
            const priceKey = Object.keys(SUGGESTED_PRICES).find(k => lowerName.includes(k.toLowerCase()));
            if (priceKey) suggestedPrice = SUGGESTED_PRICES[priceKey];

            mGroup.pieceMap.set(key, {
              name: `${p.name} ${p.diameter} ${p.union || ''}`.trim(),
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
  };

  const handleExportSummaryTable = () => {
    if (!activeCategory) return;

    const rawNodes = activeCategory.analyses.flatMap(a => a.result?.nodes || []);
    const expandedNodes: HydraulicNode[] = [];
    rawNodes.forEach(node => {
      const ids = node.id.split(',').map(s => s.trim()).filter(Boolean);
      ids.forEach(individualId => expandedNodes.push({ ...node, id: individualId }));
    });

    if (expandedNodes.length === 0) return alert("No hay nudos para exportar.");
    expandedNodes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    const pieceDetailsMap = new Map<string, { name: string, material: string, diameter: string, union: string, weight: number }>();
    expandedNodes.forEach(node => {
      node.pieces.forEach(p => {
        const key = `${p.material}|${p.name}|${p.union || 'S/U'}|${p.diameter}`;
        if (!pieceDetailsMap.has(key)) {
          const estimatedW = p.weight || getEstimatedWeight(p.name, p.diameter, p.material);
          pieceDetailsMap.set(key, {
            name: p.name,
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
    uniquePieceKeys.forEach(k => csvContent += `${pieceDetailsMap.get(k)?.union};`);
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
        const found = node.pieces.find(p => `${p.material}|${p.name}|${p.union || 'S/U'}|${p.diameter}` === k);
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
    csvContent += "CANTIDAD TOTAL;;;";
    uniquePieceKeys.forEach(k => {
      csvContent += `${totalQuantitiesPerPiece.get(k)};`;
    });
    csvContent += `${grandTotalPieces};${totalAnchorages}\n`;

    csvContent += "PESO UNITARIO (kg);;;";
    uniquePieceKeys.forEach(k => {
      csvContent += `${pieceDetailsMap.get(k)?.weight.toString().replace('.', ',')};`;
    });
    csvContent += ";\n";

    csvContent += "PESO TOTAL (kg);;;";
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
    link.setAttribute("download", `RESUMEN_PIEZAS_${activeCategory.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveToDrive = async () => {
    alert("Esta funcionalidad requiere configuración de API.");
    setShowSaveModal(false);
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
    if(c) setDeleteConfirm({ show: true, type: 'category', projectId, categoryId, name: c.name });
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

      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p,
        categories: p.categories.map(c => c.id === activeCategoryId ? {
          ...c,
          analyses: c.analyses.map(a => a.id === analysisId ? { ...a, status: 'done' as const, result } : a)
        } : c)
      } : p));
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

  // Eliminación de Análisis (Item) con confirmación estética
  const removeAnalysis = (analysisId: string) => {
    if (!activeProjectId || !activeCategoryId) return;
    setDeleteConfirm({ show: true, type: 'analysis', projectId: activeProjectId, analysisId, name: 'Análisis de Imagen' });
  };

  const handleUpdateNode = (analysisId: string, nodeId: string, updates: Partial<HydraulicNode>) => {
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

  // Eliminación de Nudo con confirmación estética
  const handleRemoveNode = (analysisId: string, nodeId: string) => {
    const analysis = activeCategory?.analyses.find(a => a.id === analysisId);
    const node = analysis?.result?.nodes.find(n => n.id === nodeId);
    setDeleteConfirm({ show: true, type: 'node', projectId: activeProjectId!, analysisId, nodeId, name: node?.nodeName || 'Nudo' });
  };

  // Ejecución efectiva de la eliminación tras confirmación
  const executeDeletion = () => {
    const { type, projectId, categoryId, analysisId, nodeId } = deleteConfirm;

    if (type === 'project') {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (activeProjectId === projectId) { setActiveProjectId(null); setActiveCategoryId(null); }
    } else if (type === 'category') {
      setProjects(prev => prev.map(p => p.id === projectId ? {
        ...p, categories: p.categories.filter(c => c.id !== categoryId)
      } : p));
      if (activeCategoryId === categoryId) setActiveCategoryId(null);
    } else if (type === 'analysis') {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p, categories: p.categories.map(c => c.id === activeCategoryId ? {
          ...c, analyses: c.analyses.filter(a => a.id !== analysisId)
        } : c)
      } : p));
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
    let nextNum = 1;
    const allNodeIds = activeCategory.analyses.flatMap(a => a.result?.nodes.map(n => n.id) || []);
    const numbers = allNodeIds.flatMap(idStr => idStr.split(',').map(s => {
      const match = s.trim().match(/\d+/);
      return match ? parseInt(match[0]) : NaN;
    }).filter(n => !isNaN(n)));
    if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;
    const formattedId = nextNum.toString().padStart(2, '0');
    const newNode: HydraulicNode = { id: formattedId, nodeName: `Nudo ${formattedId}`, type: 'Numerico', pieces: [], anchorageCount: 0 };
    const manualAnalysis: FileAnalysis = { id: generateId(), image: '', status: 'done', result: { nodes: [newNode], summary: `Manual (N° ${formattedId})` } };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? { ...c, analyses: [...c.analyses, manualAnalysis] } : c)
    } : p));
  };

  const handleUseLibraryNode = (node: LibraryNode) => {
    if (!activeProjectId || !activeCategoryId || !activeCategory) return;
    
    let nextNum = 1;
    const allNodeIds = activeCategory.analyses.flatMap(a => a.result?.nodes.map(n => n.id) || []);
    const numbers = allNodeIds.flatMap(idStr => idStr.split(',').map(s => {
        const match = s.trim().match(/\d+/);
        return match ? parseInt(match[0]) : NaN;
    }).filter(n => !isNaN(n)));
    if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;
    const formattedId = nextNum.toString().padStart(2, '0');

    const newNode: HydraulicNode = { ...node, id: formattedId };
    
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
  };

  // --- Renderizado Principal (Layout) ---
  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden font-['Inter']">
      <Sidebar
        projects={projects} activeProjectId={activeProjectId} activeCategoryId={activeCategoryId} isSidebarOpen={isSidebarOpen} credits={credits} initialCredits={INITIAL_CREDITS}
        onToggleProject={(id) => { setActiveProjectId(id === activeProjectId ? null : id); setActiveCategoryId(null); }}
        onSelectCategory={setActiveCategoryId} onOpenNewProject={handleOpenNewProject} onOpenEditProject={handleOpenEditProject}
        onDeleteProject={(pid, e) => { e.stopPropagation(); const p = projects.find(x => x.id === pid); if(p) setDeleteConfirm({ show: true, type: 'project', projectId: pid, name: p.name }); }}
        onExportProject={handleExportProject}
        onOpenLibrary={() => setShowLibraryModal(true)} onAddCategory={handleAddCategory} onEditCategory={handleEditCategory} onRemoveCategory={handleRemoveCategory}
        onImportProject={handleImportProject} onMoveCategory={handleMoveCategory}
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
                </div>
                {activeCategory && <div className="mt-2"><span className="text-[9px] font-black text-[#88C13E] uppercase tracking-widest bg-[#88C13E]/10 px-2 py-0.5 rounded-md">Capítulo: {activeCategory.name}</span></div>}
              </div>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#88C13E] transition-colors"></i>
                  <input type="text" placeholder="Buscar nudo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-6 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold text-[#004071] w-64 focus:bg-white focus:border-[#88C13E] outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowSaveModal(true)} className="px-6 py-3 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-[#002D50]">
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
                  <button onClick={() => setShowAddNodeModal(true)} className="px-4 py-3 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 hover:bg-[#002D50]">
                    <i className="fa-solid fa-plus text-xs"></i> Manual
                  </button>
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
                    {activeCategory?.analyses.map(analysis => (
                      <AnalysisCard
                        key={analysis.id} analysis={analysis} onProcess={processAnalysis} onRemove={removeAnalysis} onUpdateNode={handleUpdateNode} onRemoveNode={handleRemoveNode} onSaveToLibrary={handleSaveToLibrary} searchTerm={searchTerm} duplicateIds={chapterDuplicateIds} credits={credits} onCopyNode={handleCopyNode} activeProject={activeProject}
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

        {/* --- MODALES Y NOTIFICACIONES --- */}
        {notification && (
          <div className="fixed bottom-6 right-6 bg-green-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-300 z-[200]">
            <i className="fa-solid fa-check-circle text-xl"></i>
            <span className="text-sm font-bold">{notification}</span>
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
                <button onClick={handleSaveCategory} className="px-10 py-4 bg-[#004071] text-white rounded-2xl text-xs font-black uppercase">Crear</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
export default App;