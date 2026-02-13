
import React from 'react';
import { Project } from '../types';
import { LOGO_BASE64 } from '../logoData';
import { jsPDF } from 'jspdf';

interface MissingNodesReportModalProps {
  project: Project;
  missingNodes: number[];
  onClose: () => void;
}

const COLOR_HDG_BLUE = [0, 64, 113];
const COLOR_HDG_LIME = [136, 193, 62];

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const drawCorporateHeader = (doc: jsPDF, project: Project, title: string) => {
    const pageWidth = 210;
  
    doc.setFillColor(COLOR_HDG_BLUE[0], COLOR_HDG_BLUE[1], COLOR_HDG_BLUE[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setFillColor(COLOR_HDG_LIME[0], COLOR_HDG_LIME[1], COLOR_HDG_LIME[2]);
    doc.rect(0, 35, pageWidth, 1.5, 'F');

    try {
        doc.addImage(LOGO_BASE64, 'PNG', 14, 5, 46, 20);
    } catch (e) {
        console.error("Error cargando logo en el PDF:", e);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    
    doc.setFontSize(14);
    doc.text(title.toUpperCase(), 196, 15, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`PROYECTO: ${project.name.toUpperCase()}`, 196, 25, { align: 'right' });
    doc.text(`VERSIÓN: ${project.version} | FECHA: ${formatDate(project.date)}`, 196, 30, { align: 'right' });
};

const addPageNumbers = (doc: jsPDF) => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.setFont('helvetica', 'normal');
        doc.text(`Página ${i} de ${pageCount} | Reporte Generado por HidroScan - APU Engine Pro`, 196, 288, { align: 'right' });
    }
};

const MissingNodesReportModal: React.FC<MissingNodesReportModalProps> = ({ project, missingNodes, onClose }) => {

    const generatePDF = () => {
        const doc = new jsPDF();
        
        drawCorporateHeader(doc, project, 'Minuta de Nudos Faltantes');

        let cursorY = 55;

        doc.setTextColor(COLOR_HDG_BLUE[0], COLOR_HDG_BLUE[1], COLOR_HDG_BLUE[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`SOLICITUD DE INCORPORACIÓN DE NUDOS FALTANTES`, 15, cursorY);
        cursorY += 10;
        
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Se solicita al equipo de dibujo incorporar los siguientes nudos en la planimetría, ya que no fueron detectados en la última revisión:`, 20, cursorY);
        cursorY += 10;
        
        doc.setFont('helvetica', 'bold');
        
        const nodesText = missingNodes.map(n => `NUDO ${String(n).padStart(2, '0')}`).join(', ');
        const lines = doc.splitTextToSize(`- ${nodesText}`, 170);
        doc.text(lines, 20, cursorY);

        cursorY += lines.length * 6 + 10;

        doc.text('Agradecemos su gestión para mantener la documentación actualizada.', 20, cursorY);

        addPageNumbers(doc);
        doc.save(`MINUTA_NUDOS_FALTANTES_${project.name.replace(/\s+/g, '_')}_${project.code}.pdf`);
    };

    return (
        <div className="fixed inset-0 bg-[#002d50]/90 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
                <div className="px-10 py-8 bg-[#f8fafc] border-b flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black text-[#004071] uppercase tracking-tighter">Reporte de Nudos Faltantes</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Comunicación para el equipo de Dibujo</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
                        <i className="fa-solid fa-xmark text-slate-400"></i>
                    </button>
                </div>
                <div className="flex-grow overflow-y-auto p-10">
                    <p className="text-sm text-slate-600 mb-6">Se generará un documento PDF para informar al equipo de dibujo sobre los nudos que se han identificado como faltantes en la secuencia.</p>
                    <p className="font-bold text-slate-700">Nudos a reportar:</p>
                    <p className="text-sm text-sky-800 font-mono p-4 bg-sky-50 rounded-lg">{missingNodes.map(n => String(n).padStart(2, '0')).join(', ')}</p>
                </div>
                <div className="p-8 border-t bg-[#f8fafc] flex justify-between items-center">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">* Minuta generada por HidroScan Engine</p>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
                        <button onClick={generatePDF} className="px-10 py-4 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-[#88C13E] transition-all flex items-center gap-3">
                            <i className="fa-solid fa-file-pdf text-base"></i> Descargar Minuta
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MissingNodesReportModal;