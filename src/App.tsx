
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

  // Fixed: Added missing handlers
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
    // Library logic would go here, for now just notify or stub
    console.log('Saved to library:', node);
  };

  const handleCopyNode = (node: HydraulicNode) => {
    setCopiedNode(node);
  };

  const handleRequestAddNode = (analysisId: string) => {
    // Logic to show a modal or add an empty node
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

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar 
        projects={projects} 
        activeProjectId={activeProjectId} 
        activeCategoryId={activeCategoryId}
        onToggleProject={setActiveProjectId}
        onSelectCategory={setActiveCategoryId}
        onOpenNewProject={handleOpenNewProject}
        credits={credits}
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
    </div>
  );
}

export default App;
