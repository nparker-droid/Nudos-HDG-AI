
import React, { useState } from 'react';
import { LibraryNode } from '../types';

interface LibraryModalProps {
  nodes: LibraryNode[];
  onClose: () => void;
  onUseNode: (node: LibraryNode) => void;
  isCategoryActive: boolean;
  onUpdateNode: (libraryId: string, updates: Partial<LibraryNode>) => void;
  onRemoveNode: (libraryId: string) => void;
}

const LibraryModal: React.FC<LibraryModalProps> = ({ nodes, onClose, onUseNode, isCategoryActive, onUpdateNode, onRemoveNode }) => {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

  const handleStartEdit = (node: LibraryNode) => {
    setEditingNodeId(node.libraryId);
    setEditedName(node.nodeName);
  };

  const handleCancelEdit = () => {
    setEditingNodeId(null);
    setEditedName('');
  };

  const handleSaveEdit = () => {
    if (editingNodeId && editedName.trim()) {
      onUpdateNode(editingNodeId, { nodeName: editedName.trim() });
    }
    handleCancelEdit();
  };

  return (
    <div className="fixed inset-0 bg-[#002d50]/90 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-4xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
        <div className="px-10 py-8 bg-[#f8fafc] border-b flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-[#004071] uppercase tracking-tighter">Biblioteca de Nudos Estándar</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Recursos re-utilizables para tus proyectos</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
            <i className="fa-solid fa-xmark text-slate-400"></i>
          </button>
        </div>
        <div className="flex-grow overflow-y-auto p-10 space-y-4">
          {nodes.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <i className="fa-solid fa-box-open text-5xl mb-4"></i>
              <p className="font-bold">Tu biblioteca está vacía.</p>
              <p className="text-sm">Puedes guardar nudos en la biblioteca desde los resultados del análisis.</p>
            </div>
          ) : (
            nodes.map((node) => (
              <div key={node.libraryId} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex justify-between items-center group">
                {editingNodeId === node.libraryId ? (
                   <div className="flex-grow flex items-center gap-4">
                        <input 
                            type="text" 
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            className="flex-grow bg-white border border-slate-300 p-2 rounded-lg text-base font-black text-[#004071]"
                            autoFocus
                        />
                        <button onClick={handleSaveEdit} className="px-4 py-2 bg-green-500 text-white rounded-lg text-xs font-black"><i className="fa-solid fa-check"></i></button>
                        <button onClick={handleCancelEdit} className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-xs font-black"><i className="fa-solid fa-xmark"></i></button>
                    </div>
                ) : (
                  <>
                    <div>
                      <h4 className="text-base font-black text-[#004071]">{node.nodeName}</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {node.pieces.map(p => `${p.quantity}x ${p.name} ${p.diameter}`).join(' | ')}
                      </p>
                    </div>
                     <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleStartEdit(node)} className="p-2 text-slate-400 hover:text-[#004071]"><i className="fa-solid fa-pen text-xs"></i></button>
                            <button onClick={() => onRemoveNode(node.libraryId)} className="p-2 text-slate-400 hover:text-red-500"><i className="fa-solid fa-trash text-xs"></i></button>
                        </div>
                        <button
                          onClick={() => onUseNode(node)}
                          disabled={!isCategoryActive}
                          className="px-6 py-3 bg-[#88C13E] text-white rounded-xl text-[9px] font-black uppercase hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          title={!isCategoryActive ? "Selecciona un capítulo para usar este nudo" : "Usar este nudo"}
                        >
                          <i className="fa-solid fa-plus mr-2"></i> Usar
                        </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
        <div className="p-8 border-t bg-[#f8fafc] flex justify-end">
          <button onClick={onClose} className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

export default LibraryModal;