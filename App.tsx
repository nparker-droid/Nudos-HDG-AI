import React, { useState, useEffect, useMemo } from 'react';
import FileUploader from './components/FileUploader';
import Sidebar from './components/Sidebar';
import { analyzeHydraulicPlan } from './services/geminiService';
// Fixed: Expanded imports to include missing types
import { Project, FileAnalysis, Category, HydraulicNode, Piece, NodeMaterial, AnalysisResult, LibraryNode } from './types';
import AnalysisCard from './components/AnalysisCard';
import { Download, AlertTriangle, FileText } from 'lucide-react';

const INITIAL_CREDITS = 50;

const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(INITIAL_CREDITS);
  
  // Fixed: Added missing state variables
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState<Partial<Project>>({ name: '', code: '' });
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

  // Cargar datos
  useEffect(() => {
    const saved = localStorage.getItem('hidroscan_data');
    if (saved) {
      const data = JSON.parse(saved);
      setProjects(data.projects || []);
      setCredits(data.credits ?? INITIAL_CREDITS);
    }
  }, []);

  // Guardar datos
  useEffect(() => {
    localStorage.setItem('hidroscan_data', JSON.stringify({ projects, credits }));
  }, [projects, credits]);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeCategory = activeProject?.categories.find(c => c.id === activeCategoryId);

  // Lógica de Auditoría: Nudos Faltantes y Duplicados
  const auditResults = useMemo(() => {
    if (!activeCategory) return { missing: [], duplicates: [] };

    const allNodes = activeCategory.analyses.flatMap(a => a.result?.nodes || []);
    const ids = allNodes.map(n => parseInt(n.id)).filter(n => !isNaN(n));
    
    // Nudos faltantes
    const missing = [];
    if (ids.length > 0) {
      const maxId = Math.max(...ids);
      for (let i = 1; i <= maxId; i++) {
        if (!ids.includes(i)) missing.push(i);
      }
    }

    // Esquemas repetidos (basado en piezas idénticas)
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
    setProjectForm({ name: '', code: 'PROJ-' + Math.floor(1000 + Math.random() * 9000) });
    setShowProjectModal(true);
  };

  const handleSaveProject = () => {
    if (!projectForm.name?.trim()) return;
    const newProject: Project = {
      id: generateId(),
      name: projectForm.name,
      code: projectForm.code || '',
      date: new Date().toISOString(),
      description: '',
      version: '1.0',
      stage: 'Draft',
      commune: '',
      region: '',
      categories: []
    };
    setProjects(prev => [...prev, newProject]);
    setShowProjectModal(false);
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
    console.log('Saved to library:', node);
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

  const executeDeletion = () => {
    const { type, projectId, categoryId, analysisId, nodeId } = deleteConfirm;

    if (type === 'project') {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (activeProjectId === projectId) { 
        setActiveProjectId(null); 
        setActiveCategoryId(null); 
      }
      setNotification('Proyecto eliminado.');
      setDeleteConfirm({ ...deleteConfirm, show: false });
      
    } else if (type === 'category') {
      setProjects(prev => prev.map(p => p.id === projectId ? {
        ...p, categories: p.categories.filter(c => c.id !== categoryId)
      } : p));
      if (activeCategoryId === categoryId) setActiveCategoryId(null);
      setNotification('Capítulo eliminado.');
      setDeleteConfirm({ ...deleteConfirm, show: false });

    } else if (type === 'analysis') {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p, categories: p.categories.map(c => c.id === activeCategoryId ? {
          ...c, analyses: c.analyses.filter(a => a.id !== analysisId)
        } : c)
      } : p));
      setNotification('Análisis eliminado.');
      setDeleteConfirm({ ...deleteConfirm, show: false });

    } else if (type === 'node') {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p, categories: p.categories.map(c => c.id === activeCategoryId ? {
          ...c, analyses: c.analyses.map(a => a.id === analysisId ? {
            ...a, result: a.result ? { ...a.result, nodes: a.result.nodes.filter(n => n.id !== nodeId) } : undefined
          } : a)
        } : c)
      } : p));
      setDeleteConfirm({ ...deleteConfirm, show: false });
    }
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
      content += `Observaciones: ${a.observations || 'Sin observaciones'}\n`;
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

  // Stubs for missing state/functions used in JSX
  const [notification, setNotification] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryNodes, setLibraryNodes] = useState<LibraryNode[]>([]);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

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

  const handleExportProject = (id: string) => { console.log('Exporting', id); };
  const handleOpenEditProject = (id: string) => { console.log('Editing', id); };
  const handleMoveCategory = (pid: string, cid: string, dir: 'up' | 'down') => { console.log('Moving', cid, dir); };
  const handleEditCategory = (pid: string, cid: string, e: any) => { console.log('Editing cat', cid); };
  const handleRemoveCategory = (pid: string, cid: string, e: any) => {
     const p = projects.find(x => x.id === pid);
     const c = p?.categories.find(x => x.id === cid);
     if (c) setDeleteConfirm({ show: true, type: 'category', projectId: pid, categoryId: cid, name: c.name });
  };
  const handleImportProject = (file: File) => { console.log('Importing', file.name); };
  const handleExportSummaryTable = () => { console.log('Exporting table'); };
  const handleExportAPU = () => { console.log('Exporting APU'); };
  const handleExportLocal = () => { console.log('Exporting local'); };
  const handleSaveToDrive = () => { console.log('Saving to drive'); };
  const handleUpdateLibraryNode = (id: string, u: any) => { console.log('Update lib', id); };
  const handleRemoveLibraryNode = (id: string) => { console.log('Remove lib', id); };
  const handleExportLibrary = () => { console.log('Export lib'); };
  const handleImportLibrary = (f: File) => { console.log('Import lib', f.name); };
  const handleUseLibraryNode = (n: any) => { console.log('Use lib', n); };
  const handleCreateEmptyNode = () => { console.log('Create empty'); };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar 
        projects={projects} 
        activeProjectId={activeProjectId} 
        activeCategoryId={activeCategoryId}
        isSidebarOpen={isSidebarOpen}
        onToggleProject={setActiveProjectId}
        onSelectCategory={setActiveCategoryId}
        onOpenNewProject={handleOpenNewProject}
        onOpenEditProject={handleOpenEditProject}
        onDeleteProject={(pid, e) => {
          const p = projects.find(x => x.id === pid);
          if (p) setDeleteConfirm({ show: true, type: 'project', projectId: pid, name: p.name });
        }}
        onExportProject={handleExportProject}
        onOpenLibrary={() => setShowLibraryModal(true)}
        onAddCategory={handleAddCategory}
        onEditCategory={handleEditCategory}
        onRemoveCategory={handleRemoveCategory}
        onImportProject={handleImportProject}
        onMoveCategory={handleMoveCategory}
        credits={credits}
        initialCredits={INITIAL_CREDITS}
      />
      
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
        className={`fixed top-1/2 -translate-y-1/2 z-40 w-8 h-20 bg-gray-800 border border-gray-700 rounded-r-2xl shadow-xl flex items-center justify-center text-blue-400 transition-all duration-300 hover:bg-gray-700 ${isSidebarOpen ? 'left-[320px]' : 'left-0'}`}
      >
        {isSidebarOpen ? '<' : '>'}
      </button>

      <main className="flex-grow overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          {activeCategory ? (
            <>
              <div className="flex justify-between items-center mb-8">
                <div className="flex flex-col">
                  <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-blue-400 uppercase">{activeProject?.name}</h1>
                    <span className="text-[10px] font-black text-white uppercase tracking-widest bg-blue-600 px-2 py-1 rounded-md">{activeProject?.code}</span>
                  </div>
                  <div className="mt-2">
                    <span className="text-[9px] font-black text-green-400 uppercase tracking-widest bg-green-400/10 px-2 py-0.5 rounded-md">
                      Capítulo: {activeCategory.name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative group">
                    <input 
                      type="text" 
                      placeholder="Buscar nudo..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:border-blue-500 outline-none w-48 transition-all"
                    />
                  </div>
                  <button onClick={() => setShowSaveModal(true)} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold transition-colors text-sm flex items-center gap-2">
                    Guardar
                  </button>
                  <button onClick={handleExportSummaryTable} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold transition-colors text-sm flex items-center gap-2">
                    <Download size={18} /> Tabla
                  </button>
                  <button 
                    onClick={generateReport}
                    className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg font-bold transition-colors text-sm"
                  >
                    <FileText size={18} /> Reporte
                  </button>
                </div>
              </div>

              {/* Alertas de Auditoría */}
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

      {/* Modales */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-2xl w-96 border border-gray-700">
            <h2 className="text-xl font-bold mb-4">Nuevo Proyecto</h2>
            <input 
              type="text" 
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 mb-4"
              placeholder="Nombre del proyecto"
              value={projectForm.name}
              onChange={e => setProjectForm({...projectForm, name: e.target.value})}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowProjectModal(false)} className="px-4 py-2">Cancelar</button>
              <button onClick={handleSaveProject} className="bg-blue-600 px-4 py-2 rounded">Crear</button>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-2xl w-96 border border-gray-700 text-center">
            <h2 className="text-xl font-bold mb-4">Nuevo Capítulo</h2>
            <input 
              type="text" 
              placeholder="Ej. Impulsión..." 
              value={newCategoryName} 
              onChange={e => setNewCategoryName(e.target.value)} 
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 mb-6" 
              autoFocus 
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCategoryModal(false)} className="px-4 py-2">Cancelar</button>
              <button onClick={handleSaveCategory} className="bg-green-600 px-4 py-2 rounded">Crear</button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[250] flex items-center justify-center p-4">
            <div className="bg-gray-800 w-full max-w-xl rounded-[2rem] overflow-hidden border border-gray-700 shadow-2xl">
              <div className="px-10 py-8 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-blue-400 uppercase">Opciones de Guardado</h2>
                <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-white">X</button>
              </div>
              <div className="p-10 space-y-6">
                <button onClick={handleExportLocal} className="w-full text-left p-6 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors flex items-center gap-4">
                   <div className="p-3 bg-blue-600 rounded-lg"><Download size={24}/></div>
                   <div>
                     <div className="font-bold">Descargar Copia (.json)</div>
                     <div className="text-sm text-gray-400">Guarda un respaldo local de tu proyecto.</div>
                   </div>
                </button>
                <button onClick={handleSaveToDrive} className="w-full text-left p-6 bg-gray-700/50 opacity-50 cursor-not-allowed rounded-xl flex items-center gap-4">
                   <div className="p-3 bg-gray-600 rounded-lg"><FileText size={24}/></div>
                   <div>
                     <div className="font-bold">Google Drive (Próximamente)</div>
                   </div>
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

      {showAddNodeModal && (
          <AddNodeModal
            onClose={() => setShowAddNodeModal(false)}
            onCreateEmpty={handleCreateEmptyNode}
            onOpenLibrary={() => setShowLibraryModal(true)}
          />
      )}

      {deleteConfirm.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-gray-800 w-full max-w-md rounded-2xl p-8 border border-red-900/50 shadow-2xl text-center">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h2 className="text-xl font-bold mb-2">¿Confirmar eliminación?</h2>
            <p className="text-gray-400 mb-6">¿Estás seguro de que quieres eliminar <strong>{deleteConfirm.name}</strong>? Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm({ ...deleteConfirm, show: false })} className="flex-1 py-2 bg-gray-700 rounded-lg font-bold">Cancelar</button>
              <button onClick={executeDeletion} className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[300] animate-in slide-in-from-bottom-4">
          {notification}
        </div>
      )}
    </div>
  );
}

export default App;