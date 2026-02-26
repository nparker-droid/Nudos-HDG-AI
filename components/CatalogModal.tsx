import React, { useState, useRef } from 'react';
import { CatalogItem } from '../types.ts';
import { parseCatalogCSV } from '../services/catalogService.ts';

interface CatalogModalProps {
    isOpen: boolean;
    onClose: () => void;
    catalogItems: CatalogItem[];
    onUpdateCatalog: (items: CatalogItem[]) => void;
}

export default function CatalogModal({ isOpen, onClose, catalogItems, onUpdateCatalog }: CatalogModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [pasteData, setPasteData] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const parsedItems = parseCatalogCSV(text);
            if (parsedItems.length > 0) {
                // Merge with existing avoiding duplicates by name/diam/material
                const currentSet = new Set(catalogItems.map(i => `${i.name}|${i.diameter}|${i.material}`));
                const newItems = parsedItems.filter(i => !currentSet.has(`${i.name}|${i.diameter}|${i.material}`));
                onUpdateCatalog([...catalogItems, ...newItems]);
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePasteSubmit = () => {
        if (!pasteData.trim()) return;
        const parsedItems = parseCatalogCSV(pasteData);
        if (parsedItems.length > 0) {
            const currentSet = new Set(catalogItems.map(i => `${i.name}|${i.diameter}|${i.material}`));
            const newItems = parsedItems.filter(i => !currentSet.has(`${i.name}|${i.diameter}|${i.material}`));
            onUpdateCatalog([...catalogItems, ...newItems]);
            setPasteData('');
        }
    };

    const handleClearCatalog = () => {
        if (confirm('¿Estás seguro de querer vaciar completamente el catálogo?')) {
            onUpdateCatalog([]);
        }
    };

    const filteredItems = catalogItems.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.diameter.toString().includes(searchTerm) ||
        item.diameterInches.includes(searchTerm)
    );

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 font-['Inter']">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">

                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-[#004071] uppercase tracking-tighter flex items-center gap-3">
                            <i className="fa-solid fa-book-open text-[#88C13E]"></i> Catálogo de Materiales y Pesos
                        </h3>
                        <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">
                            {catalogItems.length} Elementos Almacenados
                        </p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-[#004071] hover:border-[#004071] hover:bg-blue-50 transition-all flex items-center justify-center">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="p-8 flex-grow overflow-y-auto flex flex-col gap-6" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)' }}>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
                        <div className="col-span-1 lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Añadir desde Archivo</h4>
                            <div className="flex items-center gap-4">
                                <input
                                    type="file"
                                    accept=".csv"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-6 py-3 bg-[#004071] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-[#002D50] transition-colors flex items-center gap-2"
                                >
                                    <i className="fa-solid fa-file-csv"></i> Importar CSV
                                </button>
                                <div className="text-[10px] text-slate-400 leading-tight">
                                    <p>Formato esperado CSV: <span className="font-bold text-slate-600">Nombre_Estandar; Diámetro; Peso_kg; Diametro_Pulgadas; Materialidad</span></p>
                                </div>
                            </div>
                        </div>

                        <div className="col-span-1 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-center">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Acciones</h4>
                            <button
                                onClick={handleClearCatalog}
                                disabled={catalogItems.length === 0}
                                className="px-6 py-3 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest border border-red-200 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-trash"></i> Vaciar Catálogo
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm shrink-0">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Carga Rápida (Pegar Datos)</h4>
                        <div className="flex gap-4">
                            <textarea
                                value={pasteData}
                                onChange={e => setPasteData(e.target.value)}
                                placeholder="Pega líneas desde Excel o CSV aquí..."
                                className="flex-grow h-20 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-600 focus:bg-white focus:border-[#88C13E] outline-none resize-none"
                            ></textarea>
                            <button
                                onClick={handlePasteSubmit}
                                disabled={!pasteData.trim()}
                                className="px-6 py-3 bg-[#88C13E] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-[#97cf49] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <i className="fa-solid fa-paste"></i> Procesar
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-grow min-h-[400px]">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Base de Datos</h4>
                            <div className="relative">
                                <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o material..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-[#004071] w-64 focus:border-[#88C13E] outline-none"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto flex-grow">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/3">Nombre</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/6">Material</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/6">D. (mm)</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/6">D. (pulg)</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-1/6">Peso (kg)</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs font-bold text-slate-600">
                                    {filteredItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                                <i className="fa-solid fa-box-open text-3xl mb-3 opacity-50 block"></i>
                                                No hay piezas en el catálogo que coincidan con la búsqueda.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredItems.slice(0, 100).map((item, idx) => (
                                            <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 text-[#004071]">{item.name}</td>
                                                <td className="px-4 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px]">{item.material}</span></td>
                                                <td className="px-4 py-3">{item.diameter}</td>
                                                <td className="px-4 py-3">{item.diameterInches}</td>
                                                <td className="px-4 py-3 text-right text-[#88C13E]">{item.weight.toFixed(2)}</td>
                                            </tr>
                                        ))
                                    )}
                                    {filteredItems.length > 100 && (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-3 text-center text-[10px] text-slate-400 font-bold bg-slate-50/50">
                                                Mostrando 100 de {filteredItems.length} resultados... Utiliza la búsqueda para afinar.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0 rounded-b-[2rem]">
                    <button onClick={onClose} className="px-8 py-3 bg-[#004071] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#002D50] transition-colors shadow-lg">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
