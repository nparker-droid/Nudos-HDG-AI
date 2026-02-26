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
    version: 'A',
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

  const executeDeletion = () => {
    const { type, projectId, categoryId, analysisId, nodeId } = deleteConfirm;
    if (type === 'project') {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (activeProjectId === projectId) { setActiveProjectId(null); setActiveCategoryId(null); }
      setNotification('Proyecto eliminado.');
    } else if (type === 'category') {
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, categories: p.categories.filter(c => c.id !== categoryId) } : p));
      if (activeCategoryId === categoryId) setActiveCategoryId(null);
      setNotification('Capítulo eliminado.');
    } else if (type === 'analysis') {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p, categories: p.categories.map(c => c.id === activeCategoryId ? { ...c, analyses: c.analyses.filter(a => a.id !== analysisId) } : c)
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

  const handleImagesSelected = (base64List: string[]) => {
    if (!activeProjectId || !activeCategoryId) return;
    const newAnalyses: FileAnalysis[] = base64List.map(img => ({ id: generateId(), image: img, status: 'pending' }));
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? { ...c, analyses: [...c.analyses, ...newAnalyses] } : c)
    } : p));
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
    setNotification('Capítulo creado.');
  };

  const handleRequestAddNode = (analysisId: string) => {
    setTargetAnalysisId(analysisId);
    setShowAddNodeModal(true);
  };

  const handleCreateEmptyNode = () => {
    if (!activeProjectId || !activeCategoryId || !activeCategory || !targetAnalysisId) return;
    const currentNodes = activeCategory.analyses.find(a => a.id === targetAnalysisId)?.result?.nodes || [];
    const allNodeIds = currentNodes.map(n => n.id);
    let nextNum = 1;
    const numbers = allNodeIds.flatMap(idStr => (idStr.match(/\d+/g) || []).map(m => parseInt(m, 10))).filter(n => !isNaN(n));
    if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;
    const formattedId = nextNum.toString().padStart(2, '0');
    const newNode: HydraulicNode = { id: formattedId, nodeName: 'Nuevo Nudo', type: 'Numerico', pieces: [], anchorageCount: 0, isManual: true };
    
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

  const handleUseLibraryNode = (node: LibraryNode) => {
    if (!activeProjectId || !activeCategoryId || !activeCategory || !targetAnalysisId) return;
    const currentNodes = activeCategory.analyses.find(a => a.id === targetAnalysisId)?.result?.nodes || [];
    const allNodeIds = currentNodes.map(n => n.id);
    let nextNum = 1;
    const numbers = allNodeIds.flatMap(idStr => (idStr.match(/\d+/g) || []).map(m => parseInt(m, 10))).filter(n => !isNaN(n));
    if (numbers.length > 0) nextNum = Math.max(...numbers) + 1;
    const formattedId = nextNum.toString().padStart(2, '0');
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

  const [targetAnalysisId, setTargetAnalysisId] = useState<string | null>(null);

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
        onDeleteProject={(pid, e) => { e.stopPropagation(); const p = projects.find(x => x.id === pid); if (p) setDeleteConfirm({ show: true, type: 'project', projectId: pid, name: p.name }); }}
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
                {activeCategory.analyses.map((analysis, idx) => (
                    <AnalysisCard 
                        key={analysis.id}
                        analysis={{...analysis, documentNumber: idx + 1}}
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
          <div className="bg-white w-full max-w-md p-8 rounded-3xl border border-slate-200">
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