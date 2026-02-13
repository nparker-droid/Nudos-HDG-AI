
import React, { useRef, useEffect, useCallback } from 'react';
interface FileUploaderProps {
  onImagesSelected: (base64List: string[]) => void;
  loading: boolean;
}
const FileUploader: React.FC<FileUploaderProps> = ({ onImagesSelected, loading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processFiles = useCallback((files: FileList | File[]) => {
    const promises = Array.from(files).map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });
    Promise.all(promises).then(base64List => {
      onImagesSelected(base64List);
    });
  }, [onImagesSelected]);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1 || items[i].type.indexOf("pdf") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) files.push(blob);
      }
    }
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);
  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);
  return (
    <div 
      onClick={() => !loading && fileInputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!loading && e.dataTransfer.files) processFiles(e.dataTransfer.files);
      }}
      className={`
        relative border-4 border-dashed rounded-[2.5rem] p-16 text-center cursor-pointer transition-all w-full group
        ${loading ? 'bg-slate-50 border-slate-300 cursor-not-allowed opacity-50' : 'bg-white border-slate-100 hover:border-[#b8d433] hover:bg-slate-50 shadow-2xl shadow-slate-100'}
      `}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*,.pdf" 
        multiple
        onChange={handleFileChange} 
      />
      <div className="flex flex-col items-center gap-6">
        <div className="w-24 h-24 bg-[#003b63] text-[#b8d433] rounded-[2rem] flex items-center justify-center shadow-2xl transition-transform group-hover:scale-110 duration-500">
          <i className="fa-solid fa-file-pdf text-4xl"></i>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-black text-[#003b63] uppercase tracking-tighter">Cargar Planos o Cuadros</h3>
          <p className="text-[11px] text-slate-400 font-bold tracking-[0.2em] uppercase leading-relaxed">
            Arrastra Imagenes o PDFs, <span className="text-[#003b63]">pega del portapapeles</span> <br/> o haz clic para explorar
          </p>
        </div>
      </div>
    </div>
  );
};
export default FileUploader;
