import React from 'react';

interface AddNodeModalProps {
  onClose: () => void;
  onCreateEmpty: () => void;
  onOpenLibrary: () => void;
}

const AddNodeModal: React.FC<AddNodeModalProps> = ({ onClose, onCreateEmpty, onOpenLibrary }) => {
  const handleCreateEmpty = () => {
    onCreateEmpty();
    onClose();
  };

  const handleOpenLibrary = () => {
    onOpenLibrary();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#002d50]/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95">
        <div className="px-10 py-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-black text-[#004071] uppercase">Añadir Nudo Manualmente</h2>
          <button onClick={onClose}><i className="fa-solid fa-xmark text-slate-300"></i></button>
        </div>
        <div className="p-10 grid grid-cols-2 gap-8">
          <button
            onClick={handleCreateEmpty}
            className="p-10 bg-slate-50 border-2 border-slate-200 rounded-[2rem] text-center group hover:border-[#004071] hover:bg-white transition-all"
          >
            <i className="fa-solid fa-plus text-4xl text-[#004071] mb-4"></i>
            <h3 className="text-base font-black text-[#004071] uppercase">Crear Nudo Vacío</h3>
            <p className="text-xs text-slate-400 mt-1">Comienza con un esquema en blanco para definirlo desde cero.</p>
          </button>
          <button
            onClick={handleOpenLibrary}
            className="p-10 bg-slate-50 border-2 border-slate-200 rounded-[2rem] text-center group hover:border-[#88C13E] hover:bg-white transition-all"
          >
            <i className="fa-solid fa-book-bookmark text-4xl text-[#88C13E] mb-4"></i>
            <h3 className="text-base font-black text-[#004071] uppercase">Desde Biblioteca</h3>
            <p className="text-xs text-slate-400 mt-1">Usa un nudo estándar predefinido de tu colección.</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddNodeModal;
