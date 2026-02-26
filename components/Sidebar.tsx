import React, { useRef } from 'react';
import { Project } from '../types.ts';

/**
 * Componente Visual del Logo corporativo
 */
const HidrogestionLogo = ({ size = "w-9 h-9" }: { size?: string }) => (
  <div className="flex items-center justify-center">
    <svg viewBox="0 0 100 100" className={`${size} flex-shrink-0 shadow-inner rounded-full bg-white`}>
      <circle cx="50" cy="50" r="48" fill="white" />
      <mask id="m"> <circle cx="50" cy="50" r="48" fill="white" /> </mask>
      <g mask="url(#m)">
        <rect x="0" y="0" width="100" height="25" fill="#D9E021" />
        <rect x="0" y="25" width="100" height="20" fill="#88C13E" />
        <rect x="0" y="45" width="100" height="20" fill="#004071" />
        <rect x="0" y="65" width="100" height="35" fill="#002D50" />
      </g>
    </svg>
  </div>
);

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  activeCategoryId: string | null;
  isSidebarOpen: boolean;
  credits: number;
  initialCredits: number;
  onToggleProject: (projectId: string) => void;
  onSelectCategory: (categoryId: string) => void;
  onOpenNewProject: () => void;
  onOpenEditProject: (projectId: string) => void;
  onDeleteProject: (projectId: string, e: React.MouseEvent) => void;
  onExportProject: (projectId: string, e: React.MouseEvent) => void;
  onOpenLibrary: () => void;
  onAddCategory: (projectId: string) => void;
  onEditCategory: (projectId: string, categoryId: string, e: React.MouseEvent) => void;
  onRemoveCategory: (projectId: string, categoryId: string, e: React.MouseEvent) => void;
  onImportProject: (file: File) => void;
  onMoveCategory: (projectId: string, categoryId: string, direction: 'up' | 'down') => void;
  onOpenCatalog: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  projects,
  activeProjectId,
  activeCategoryId,
  isSidebarOpen,
  credits,
  initialCredits,
  onToggleProject,
  onSelectCategory,
  onOpenNewProject,
  onOpenEditProject,
  onDeleteProject,
  onExportProject,
  onOpenLibrary,
  onAddCategory,
  onEditCategory,
  onRemoveCategory,
  onImportProject,
  onMoveCategory,
  onOpenCatalog
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImportProject(e.target.files[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <aside className={`bg-white border-r border-slate-200 text-slate-600 flex flex-col shrink-0 shadow-2xl z-30 transition-all duration-300 relative ${isSidebarOpen ? 'w-[320px]' : 'w-0 overflow-hidden'}`}>

      <div className="p-6 border-b flex items-center gap-3 bg-white sticky top-0 z-10 whitespace-nowrap">
        <HidrogestionLogo />
        <div className="flex flex-col leading-none">
          <h2 className="text-[11px] font-black tracking-tighter uppercase text-[#004071]">GESTOR DE NUDOS</h2>
          <p className="text-[7px] font-bold text-slate-400 tracking-widest uppercase mt-0.5">Nudos y Piezas Especiales</p>
        </div>
      </div>

      <div className="p-4 space-y-2 whitespace-nowrap">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenNewProject}
            className="bg-[#004071] hover:bg-[#002D50] text-white py-4 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95"
          >
            <i className="fa-solid fa-plus"></i> Nuevo
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-100 hover:bg-slate-200 text-[#004071] py-4 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-slate-200"
          >
            <i className="fa-solid fa-file-import"></i> Importar
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            onClick={onOpenLibrary}
            className="w-full bg-[#88C13E] hover:bg-[#a6bf2e] text-white py-3 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
            title="Biblioteca de Nudos Estándar"
          >
            <i className="fa-solid fa-book-bookmark text-xs"></i> Biblioteca Nudos
          </button>
          <button
            onClick={onOpenCatalog}
            className="w-full bg-[#004071] hover:bg-[#002D50] text-white py-3 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 border border-transparent"
            title="Catálogo de Materiales y Pesos"
          >
            <i className="fa-solid fa-book-open text-[#88C13E] text-xs"></i> Catálogo Piezas
          </button>
        </div>
      </div>

      <div className="flex-grow px-4 py-4 overflow-y-auto space-y-4">
        <h3 className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 whitespace-nowrap">Base de Datos de Proyectos</h3>
        {projects.length === 0 && (
          <div className="p-4 text-center text-[10px] text-slate-300 italic">No hay proyectos activos</div>
        )}
        {projects.map(p => (
          <div key={p.id} className="group/project">
            <div
              onClick={() => onToggleProject(p.id)}
              className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${activeProjectId === p.id ? 'bg-[#004071] text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <i className={`fa-solid fa-folder text-[14px] ${activeProjectId === p.id ? 'text-[#D9E021]' : 'opacity-40'}`}></i>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[12px] font-black truncate uppercase tracking-tighter">{p.name}</span>
                  <span className="text-[8px] font-bold opacity-60 uppercase">{p.code}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover/project:opacity-100 transition-opacity">
                <button onClick={(e) => onExportProject(p.id, e)} className="p-1 hover:text-[#88C13E]"><i className="fa-solid fa-download text-[10px]"></i></button>
                <button onClick={(e) => { e.stopPropagation(); onOpenEditProject(p.id); }} className="p-1 hover:text-[#D9E021]"><i className="fa-solid fa-gear text-[10px]"></i></button>
                <button onClick={(e) => onDeleteProject(p.id, e)} className="p-1 hover:text-red-400"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
              </div>
            </div>

            {activeProjectId === p.id && (
              <div className="ml-5 mt-2 space-y-1 animate-in slide-in-from-left-2 duration-300">
                {(p.categories || []).map((cat, idx) => (
                  <div
                    key={cat.id}
                    onClick={() => onSelectCategory(cat.id)}
                    className={`group/cat flex items-center justify-between p-3 rounded-xl cursor-pointer text-[11px] font-bold uppercase tracking-tight transition-all ${activeCategoryId === cat.id ? 'bg-[#88C13E] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[9px] opacity-40 font-black">{idx + 1}.</span>
                      <i className={`fa-solid fa-tags text-[9px] ${activeCategoryId === cat.id ? 'text-white' : 'text-slate-300'}`}></i>
                      <span className="truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); onMoveCategory(p.id, cat.id, 'up'); }} className="hover:text-[#004071]"><i className="fa-solid fa-chevron-up text-[7px]"></i></button>
                        <button onClick={(e) => { e.stopPropagation(); onMoveCategory(p.id, cat.id, 'down'); }} className="hover:text-[#004071]"><i className="fa-solid fa-chevron-down text-[7px]"></i></button>
                      </div>
                      <button onClick={(e) => onEditCategory(p.id, cat.id, e)} className="p-1"><i className="fa-solid fa-pen text-[8px]"></i></button>
                      <button onClick={(e) => onRemoveCategory(p.id, cat.id, e)} className="p-1 hover:text-red-400"><i className="fa-solid fa-trash text-[8px]"></i></button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => onAddCategory(p.id)}
                  className="w-full text-left p-2.5 text-[10px] text-[#004071] hover:bg-slate-100 rounded-xl flex items-center gap-2 font-black uppercase tracking-widest transition-all border border-dashed border-[#004071]/20 mt-2"
                >
                  <i className="fa-solid fa-plus"></i> Nuevo Capítulo
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;