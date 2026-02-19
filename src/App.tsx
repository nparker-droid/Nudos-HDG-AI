
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FileUploader from './components/FileUploader';
import Sidebar from './components/Sidebar';
import { analyzeHydraulicPlan } from './services/geminiService';
// Fixed: Added AnalysisResult to the imports from types.ts
import { Project, FileAnalysis, Category, HydraulicNode, Piece, NodeMaterial, LibraryNode, AnalysisResult } from './types';
import AnalysisCard from './components/AnalysisCard';
import AddNodeModal from './components/AddNodeModal';
import LibraryModal from './components/LibraryModal';
import AuditReportModal from './components/AuditReportModal';
import { Download, AlertTriangle, FileText, X, Settings2, ClipboardList, MapPin, Save, Calendar, MessageSquare, Play, Trash2 } from 'lucide-react';

const INITIAL_CREDITS = 50;

const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(INITIAL_CREDITS);
  const [libraryNodes, setLibraryNodes] = useState<LibraryNode[]>([]);
  
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showAuditReportModal, setShowAuditReportModal] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedNode, setCopiedNode] = useState<HydraulicNode | null>(null);

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
    code: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    version: '1.0',
    stage: 'Licitación',
    commune: '',
    region: ''
  });

  // Load data from local storage
  useEffect(() => {
    const saved = localStorage.getItem('hidroscan_data');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setProjects(data.projects || []);
        setCredits(data.credits ?? INITIAL_CREDITS);
        setLibraryNodes(data.libraryNodes || []);
      } catch (e) {
        console.error("Error loading data", e);
      }
    }
  }, []);

  // Persist data to local storage
  useEffect(() => {
    localStorage.setItem('hidroscan_data', JSON.stringify({ projects, credits, libraryNodes }));
  }, [projects, credits, libraryNodes]);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeCategory = activeProject?.categories.find(c => c.id === activeCategoryId);

  // Audit Logic: Missing and Duplicate Nodes
  const auditResults = useMemo(() => {
    if (!activeCategory) return { missing: [], duplicates: [] };

    const allNodes = activeCategory.analyses.flatMap(a => a.result?.nodes || []);
    const ids = allNodes.map(n => parseInt(n.id)).filter(n => !isNaN(n));
    
    const missing = [];
    if (ids.length > 0) {
      const maxId = Math.max(...ids);
      for (let i = 1; i <= maxId; i++) {
        if (!ids.includes(i)) missing.push(i);
      }
    }

    const seenSchemes = new Map<string, string>();
    const duplicates: string[] = [];
    allNodes.forEach(node => {
      const schemeKey = JSON.stringify(node.pieces.map(p => `${p.name}-${p.diameter}-${p.quantity}`));
      if (seenSchemes.has(schemeKey)) {
        duplicates.push(`${node.id} (igual al nudo ${seenSchemes.get(schemeKey)})`);
      } else {
        seenSchemes.set(schemeKey, node.id);
      }
    });

    return { missing, duplicates };
  }, [activeCategory]);

  const handleOpenNewProject = () => {
    setProjectForm({
      code: `HDG-${new Date().getFullYear()}-`,
      name: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      version: '1.0',
      stage: 'Licitación',
      commune: '',
      region: ''
    });
    setIsEditingProject(false);
    setShowProjectModal(true);
  };

  // Fixed: Added handleOpenEditProject function
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
    
    if (isEditingProject && activeProjectId) {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, ...projectForm } as Project : p));
    } else {
      const newProject: Project = {
        ...projectForm as Project,
        id: generateId(),
        categories: []
      };
      setProjects(prev => [...prev, newProject]);
      setActiveProjectId(newProject.id);
    }
    setShowProjectModal(false);
  };

  // Fixed: Added handleExportProject function
  const handleExportProject = (projectId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // Fixed: Added handleImportProject function
  const handleImportProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (imported.id && imported.name && Array.isArray(imported.categories)) {
          const newProject = { ...imported, id: generateId() };
          setProjects(prev => [...prev, newProject]);
          setActiveProjectId(newProject.id);
        } else {
          throw new Error("Formato inválido");
        }
      } catch (err) {
        alert("El archivo no es un proyecto válido de Hidrogestión");
      }
    };
    reader.readAsText(file);
  };

  const handleProcess = async (analysisId: string) => {
    const analysis = activeCategory?.analyses.find(a => a.id === analysisId);
    if (!analysis || !analysis.image) return;

    updateAnalysisStatus(analysisId, 'analyzing');
    try {
      const result = await analyzeHydraulicPlan(analysis.image);
      updateAnalysisResult(analysisId, result);
      setCredits(c => c - 1);
    } catch (error) {
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
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c,
        analyses: c.analyses.map(a => a.id === analysisId ? {
          ...a,
          result: a.result ? { ...a.result, nodes: a.result.nodes.filter(n => n.id !== nodeId) } : undefined
        } : a)
      } : c)
    } : p));
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

  const handleSaveToLibrary = (node: HydraulicNode) => {
    const { id, ...rest } = node;
    const libNode: LibraryNode = { ...rest, libraryId: generateId() };
    setLibraryNodes(prev => [...prev, libNode]);
  };

  const handleCopyNode = (node: HydraulicNode) => {
    setCopiedNode(node);
  };

  const handleRequestAddNode = (analysisId: string) => {
    const newNode: HydraulicNode = {
      id: (Math.floor(Math.random() * 100)).toString(),
      nodeName: 'Nuevo Nudo',
      type: 'Numerico',
      pieces: [],
      anchorageCount: 0,
      isManual: true
    };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      categories: p.categories.map(c => c.id === activeCategoryId ? {
        ...c,
        analyses: c.analyses.map(a => a.id === analysisId ? {
          ...a,
          result: a.result ? { ...a.result, nodes: [...a.result.nodes, newNode] } : { nodes: [newNode], summary: 'Manual' }
        } : a)
      } : c)
    } : p));
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
    const name = prompt("Nombre del capítulo:");
    if (name) {
      setProjects(prev => prev.map(p => p.id === projectId ? {
        ...p,
        categories: [...p.categories, { id: generateId(), name, analyses: [] }]
      } : p));
    }
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
    setProjects(prev => prev.map(p => p.id === projectId ? {
      ...p,
      categories: p.categories.filter(c => c.id !== categoryId)
    } : p));
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
          ...c, analyses: c.analyses.filter(a => a.id === analysisId)
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

  const generateReport = () => {
    if (!activeCategory) return;
    let content = `REPORTE DE AUDITORÍA - ${activeProject?.name} / ${activeCategory.name}\n`;
    content += `Fecha: ${new Date().toLocaleDateString()}\n`;
    content += `-------------------------------------------\n\n`;
    
    content += `OBSERVACIONES DE CAPÍTULO:\n`;
    content += `Nudos Faltantes: ${auditResults.missing.length > 0 ? auditResults.missing.join(', ') : 'Ninguno'}\n`;
    content += `Esquemas Duplicados: ${auditResults.duplicates.length > 0 ? auditResults.duplicates.join('; ') : 'Ninguno'}\n\n`;

    activeCategory.analyses.forEach((a, i) => {
      content += `DOCUMENTO ${i + 1}: ${a.customName || 'Sin nombre'}\n`;
      if (a.result) {
        a.result.nodes.forEach(n => {
          content += `- Nudo ${n.id}: ${n.nodeName} (${n.pieces.length} piezas)\n`;
        });
      }
      content += `\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_${activeCategory.name}.txt`;
    link.click();
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar 
        projects={projects} 
        activeProjectId={activeProjectId} 
        activeCategoryId={activeCategoryId}
        onToggleProject={setActiveProjectId}
        onSelectCategory={setActiveCategoryId}
        onOpenNewProject={handleOpenNewProject}
        onOpenEditProject={handleOpenEditProject}
        onDeleteProject={(pid, e) => { e.stopPropagation(); const p = projects.find(x => x.id === pid); if (p) setDeleteConfirm({ show: true, type: 'project', projectId: pid, name: p.name }); }}
        onExportProject={handleExportProject}
        onImportProject={handleImportProject}
        onOpenLibrary={() => setShowLibraryModal(true)}
        onAddCategory={handleAddCategory}
        onEditCategory={handleEditCategory}
        onRemoveCategory={handleRemoveCategory}
        onMoveCategory={handleMoveCategory}
        credits={credits}
        isSidebarOpen={true}
        initialCredits={INITIAL_CREDITS}
      />
      
      <main className="flex-grow overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          {activeCategory ? (
            <>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-blue-400">{activeCategory.name}</h1>
                  <p className="text-gray-400">{activeProject?.name}</p>
                </div>
                <button 
                  onClick={generateReport}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold transition-colors"
                >
                  <Download size={18} /> Generar Reporte
                </button>
              </div>

              {/* Auditoría Alertas */}
              {(auditResults.missing.length > 0 || auditResults.duplicates.length > 0) && (
                <div className="mb-8 p-4 bg-amber-900/30 border border-amber-500/50 rounded-xl">
                  <div className="flex items-center gap-2 text-amber-500 mb-2 font-bold">
                    <AlertTriangle size={20} />
                    <span>OBSERVACIONES DE CALIDAD</span>
                  </div>
                  <ul className="text-sm space-y-1 text-amber-200/80">
                    {auditResults.missing.length > 0 && (
                      <li>• Gaps en numeración (Nudos faltantes): {auditResults.missing.join(', ')}</li>
                    )}
                    {auditResults.duplicates.length > 0 && (
                      <li>• Esquemas duplicados detectados: {auditResults.duplicates.join('; ')}</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="space-y-6">
                {activeCategory.analyses.map((analysis, idx) => (
                  <AnalysisCard 
                    key={analysis.id}
                    analysis={{...analysis, documentNumber: idx + 1}}
                    onProcess={handleProcess}
                    onUpdateAnalysisName={handleUpdateAnalysisName}
                    onUpdateNode={handleUpdateNode}
                    onRemoveNode={handleRemoveNode}
                    onRemove={removeAnalysis}
                    onSaveToLibrary={handleSaveToLibrary}
                    onCopyNode={handleCopyNode}
                    onAddNode={handleRequestAddNode}
                    searchTerm={searchTerm}
                    duplicateIds={new Set(auditResults.duplicates)}
                    credits={credits}
                    activeProject={activeProject}
                  />
                ))}
                
                <div className="mt-8">
                  <FileUploader onImagesSelected={handleImagesSelected} loading={false} />
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <FileText size={64} className="mb-4 opacity-20" />
              <p>Selecciona un proyecto y capítulo para comenzar</p>
            </div>
          )}
        </div>
      </main>

      {/* MODAL FICHA TÉCNICA - NUEVO PROYECTO */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="px-10 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-[#004071]">
                  <Settings2 size={24} />
                </div>
                <h2 className="text-2xl font-black text-[#004071] uppercase tracking-tight">Ficha Técnica de Proyecto</h2>
              </div>
              <button 
                onClick={() => setShowProjectModal(false)}
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors text-slate-300 hover:text-red-500"
              >
                <X size={24} />
              </button>
            </div>

            {/* Contenido */}
            <div className="p-10 space-y-10">
              {/* Sección 1: Identificación */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-[#88C13E]">
                  <ClipboardList size={20} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Identificación del Proyecto</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Código HDG</label>
                    <input 
                      type="text" 
                      value={projectForm.code}
                      onChange={e => setProjectForm({...projectForm, code: e.target.value})}
                      placeholder="HDG-2024-XX"
                      className="w-full bg-[#F8FAFC] border-2 border-transparent focus:border-[#004071] focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold text-[#004071]"
                    />
                  </div>
                  <div className="md:col-span-6">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nombre del Proyecto</label>
                    <input 
                      type="text" 
                      value={projectForm.name}
                      onChange={e => setProjectForm({...projectForm, name: e.target.value})}
                      className="w-full bg-[#F8FAFC] border-2 border-transparent focus:border-[#004071] focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold text-[#004071]"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Fecha Emisión</label>
                    <div className="relative">
                      <input 
                        type="date" 
                        value={projectForm.date}
                        onChange={e => setProjectForm({...projectForm, date: e.target.value})}
                        className="w-full bg-[#F8FAFC] border-2 border-transparent focus:border-[#004071] focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold text-[#004071]"
                      />
                      <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={18} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección 2: Descripción y Ubicación */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-[#88C13E]">
                  <MapPin size={20} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Descripción y Ubicación</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Descripción General</label>
                    <textarea 
                      value={projectForm.description}
                      onChange={e => setProjectForm({...projectForm, description: e.target.value})}
                      placeholder="Alcance del proyecto..."
                      className="w-full h-36 bg-[#F8FAFC] border-2 border-transparent focus:border-[#004071] focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-medium text-slate-600 resize-none"
                    />
                  </div>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Versión / Etapa</label>
                        <input 
                          type="text" 
                          value={projectForm.version}
                          onChange={e => setProjectForm({...projectForm, version: e.target.value})}
                          placeholder="1.0"
                          className="w-full bg-[#F8FAFC] border-2 border-transparent focus:border-[#004071] focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold text-[#004071]"
                        />
                      </div>
                      <div className="mt-6">
                        <select 
                          value={projectForm.stage}
                          onChange={e => setProjectForm({...projectForm, stage: e.target.value})}
                          className="w-full bg-[#F8FAFC] border-2 border-transparent focus:border-[#004071] focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold text-[#004071] appearance-none"
                        >
                          <option>Licitación</option>
                          <option>Ingeniería Básica</option>
                          <option>Ingeniería de Detalle</option>
                          <option>Construcción</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Comuna</label>
                        <input 
                          type="text" 
                          value={projectForm.commune}
                          onChange={e => setProjectForm({...projectForm, commune: e.target.value})}
                          className="w-full bg-[#F8FAFC] border-2 border-transparent focus:border-[#004071] focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold text-[#004071]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Región</label>
                        <input 
                          type="text" 
                          value={projectForm.region}
                          onChange={e => setProjectForm({...projectForm, region: e.target.value})}
                          className="w-full bg-[#F8FAFC] border-2 border-transparent focus:border-[#004071] focus:bg-white p-4 rounded-2xl outline-none transition-all text-sm font-bold text-[#004071]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botón Footer */}
              <div className="pt-6">
                <button 
                  onClick={handleSaveProject}
                  className="w-full bg-[#004071] text-white py-5 rounded-2xl flex items-center justify-center gap-4 font-black uppercase tracking-widest shadow-2xl hover:bg-[#003157] hover:scale-[1.01] active:scale-95 transition-all"
                >
                  <Save size={20} />
                  {isEditingProject ? 'ACTUALIZAR PROYECTO HIDROGESTIÓN' : 'INICIALIZAR NUEVO PROYECTO HIDROGESTIÓN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLibraryModal && (
        <LibraryModal
          nodes={libraryNodes}
          onClose={() => setShowLibraryModal(false)}
          onUseNode={(node) => {
            if (!activeProjectId || !activeCategoryId) return;
            const newNode: HydraulicNode = {
              ...node,
              id: (Math.floor(Math.random() * 100)).toString(),
              isManual: true
            };
            setProjects(prev => prev.map(p => p.id === activeProjectId ? {
              ...p,
              categories: p.categories.map(c => c.id === activeCategoryId ? {
                ...c,
                analyses: [...c.analyses, { id: generateId(), image: '', status: 'done', result: { nodes: [newNode], summary: 'Biblioteca' } }]
              } : c)
            } : p));
            setShowLibraryModal(false);
          }}
          isCategoryActive={!!activeCategoryId}
          onUpdateNode={(id, updates) => setLibraryNodes(prev => prev.map(n => n.libraryId === id ? { ...n, ...updates } : n))}
          onRemoveNode={(id) => setLibraryNodes(prev => prev.filter(n => n.libraryId !== id))}
          onExportLibrary={() => {}}
          onImportLibrary={() => {}}
        />
      )}

      {deleteConfirm.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 w-full max-w-md rounded-2xl p-8 text-center shadow-2xl">
            <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">¿Confirmar eliminación?</h2>
            <p className="text-gray-400 mb-8">Esta acción eliminará definitivamente: <br /><span className="text-white font-bold">"{deleteConfirm.name}"</span></p>
            <div className="flex gap-4">
              <button 
                onClick={executeDeletion}
                className="flex-1 bg-red-600 hover:bg-red-700 py-3 rounded-xl font-bold transition-colors"
              >
                Eliminar
              </button>
              <button 
                onClick={() => setDeleteConfirm({ ...deleteConfirm, show: false })}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-bold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
