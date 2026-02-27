import React from 'react';
import { Project, HydraulicNode } from '../types.ts';
import { LOGO_BASE64 } from '../logoData.ts';
import { jsPDF } from 'jspdf';

interface MissingNodeInfo {
    type: string;
    number: number;
}

interface AuditReportModalProps {
    project: Project;
    repeatedNodes: HydraulicNode[];
    missingNodes: MissingNodeInfo[];
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

const getPrefixLabel = (type: string) => {
    const prefixMap: Record<string, string> = {
        'Corte': 'C',
        'Ventosa': 'V',
        'Desague': 'D',
        'Reductora': 'R',
        'Grifo': 'G',
        'Numerico': ''
    };
    return prefixMap[type] || '';
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
        doc.text(`Página ${i} de ${pageCount}`, 196, 288, { align: 'right' });
    }
};

const AuditReportModal: React.FC<AuditReportModalProps> = ({ project, repeatedNodes, missingNodes, onClose }) => {

    const generatePDF = () => {
        const doc = new jsPDF();
        let cursorY = 55;
        let sectionCounter = 1;
        const maxTextWidth = 175;

        drawCorporateHeader(doc, project, 'Minuta Técnica de Nudos');

        // Sección 1: Esquemas Repetidos
        if (repeatedNodes.length > 0) {
            doc.setTextColor(COLOR_HDG_BLUE[0], COLOR_HDG_BLUE[1], COLOR_HDG_BLUE[2]);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`${sectionCounter++}. SUGERENCIA DE UNIFICACIÓN DE ESQUEMAS`, 15, cursorY);
            cursorY += 8;

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const introText = 'Se ha detectado que múltiples esquemas de nudos son idénticos. Para optimizar el plano, se sugiere unificarlos.';
            const introLines = doc.splitTextToSize(introText, maxTextWidth);
            doc.text(introLines, 20, cursorY);
            cursorY += (introLines.length * 5) + 5;

            repeatedNodes.forEach(node => {
                if (cursorY > 250) {
                    doc.addPage();
                    drawCorporateHeader(doc, project, 'Minuta Técnica de Nudos');
                    cursorY = 55;
                }
                doc.setFont('helvetica', 'bold');
                const docRef = node.docIndex ? ` (Doc N° ${node.docIndex})` : '';
                const nodeTitleLines = doc.splitTextToSize(`ESQUEMA UNIFICADO: "${node.nodeName}"${docRef}`, maxTextWidth);
                doc.text(nodeTitleLines, 20, cursorY);
                cursorY += (nodeTitleLines.length * 6);

                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 100, 100);
                const groupsText = (node.sourceGroupings || []).map(group => `[${group}]`).join(' y ');
                const detailLines = doc.splitTextToSize(`Este esquema se repitió en los grupos de nudos: ${groupsText}.`, maxTextWidth - 5);
                doc.text(detailLines, 25, cursorY);
                cursorY += (detailLines.length * 5) + 1;

                doc.setTextColor(0, 0, 0);
                const suggestionLines = doc.splitTextToSize(`Sugerencia: Unificar en un solo esquema para los nudos: ${node.id}.`, maxTextWidth - 5);
                doc.text(suggestionLines, 25, cursorY);
                cursorY += (suggestionLines.length * 5) + 10;
            });
            cursorY += 5;
        }

        // Sección 2: Nudos Faltantes
        if (missingNodes.length > 0) {
            if (cursorY > 240) {
                doc.addPage();
                drawCorporateHeader(doc, project, 'Minuta Técnica de Nudos');
                cursorY = 55;
            }
            doc.setTextColor(COLOR_HDG_BLUE[0], COLOR_HDG_BLUE[1], COLOR_HDG_BLUE[2]);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`${sectionCounter++}. SOLICITUD DE INCORPORACIÓN DE NUDOS FALTANTES`, 15, cursorY);
            cursorY += 8;

            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const missingIntro = 'Se solicita incorporar los siguientes nudos por haber identificado saltos en la secuencia correlativa:';
            const missingIntroLines = doc.splitTextToSize(missingIntro, maxTextWidth);
            doc.text(missingIntroLines, 20, cursorY);
            cursorY += (missingIntroLines.length * 5) + 5;

            // Agrupamos por tipo para el reporte
            const byType: Record<string, number[]> = {};
            missingNodes.forEach(n => {
                if (!byType[n.type]) byType[n.type] = [];
                byType[n.type].push(n.number);
            });

            Object.entries(byType).forEach(([type, nums]) => {
                const prefix = getPrefixLabel(type);
                const label = type === 'Numerico' ? 'NUDOS' : (type === 'Grifo' ? 'GRIFOS' : `CÁMARAS (${type.toUpperCase()})`);
                const formattedNums = nums.map(n => prefix ? `${prefix}-${n}` : String(n).padStart(2, '0')).join(', ');

                doc.setFont('helvetica', 'bold');
                doc.text(`${label}:`, 25, cursorY);
                cursorY += 6;
                doc.setFont('helvetica', 'normal');
                const lines = doc.splitTextToSize(formattedNums, maxTextWidth - 10);
                doc.text(lines, 30, cursorY);
                cursorY += (lines.length * 5) + 5;

                if (cursorY > 270) {
                    doc.addPage();
                    drawCorporateHeader(doc, project, 'Minuta Técnica de Nudos');
                    cursorY = 55;
                }
            });
        }

        addPageNumbers(doc);
        doc.save(`MINUTA_TECNICA_${project.name.replace(/\s+/g, '_')}_${project.code}.pdf`);
    };

    return (
        <div className="fixed inset-0 bg-[#002d50]/90 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
                <div className="px-10 py-8 bg-[#f8fafc] border-b flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black text-[#004071] uppercase tracking-tighter">Minuta Técnica de Nudos</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sugerencias para el equipo de Dibujo</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
                        <i className="fa-solid fa-xmark text-slate-400"></i>
                    </button>
                </div>
                <div className="flex-grow overflow-y-auto p-10">
                    <p className="text-sm text-slate-600 mb-6">Se generará un documento PDF para informar al equipo de dibujo sobre los hallazgos del análisis. Por favor, confirma el contenido a continuación:</p>

                    <div className="space-y-6">
                        {repeatedNodes.length > 0 && (
                            <div>
                                <h4 className="font-bold text-slate-700">Unificación de Esquemas</h4>
                                <p className="text-xs text-slate-500">Se reportarán <span className="font-bold">{repeatedNodes.length}</span> grupo(s) de esquemas idénticos para su consolidación.</p>
                                <div className="mt-2 space-y-1">
                                    {repeatedNodes.map((n, i) => (
                                        <p key={i} className="text-[10px] text-slate-500 italic">
                                            - {n.nodeName} {n.docIndex ? `(Identificado en Documento N° ${n.docIndex})` : ''}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}

                        {missingNodes.length > 0 && (
                            <div>
                                <h4 className="font-bold text-slate-700">Nudos Faltantes Detallados</h4>
                                <p className="text-xs text-slate-500">Se solicitará la incorporación de los siguientes <span className="font-bold">{missingNodes.length}</span> nudo(s) faltantes:</p>
                                <div className="mt-2 space-y-2">
                                    {missingNodes.map((n, i) => {
                                        const prefix = getPrefixLabel(n.type);
                                        const label = prefix ? `${prefix}-${n.number}` : String(n.number).padStart(2, '0');
                                        return (
                                            <span key={i} className="inline-block px-2 py-1 bg-sky-50 text-sky-800 text-[10px] font-bold rounded mr-1 mb-1 border border-sky-100 uppercase">
                                                {label} ({n.type})
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {(repeatedNodes.length === 0 && missingNodes.length === 0) && (
                            <p className="text-center text-sm text-slate-400 italic py-8">No has seleccionado nudos faltantes para reportar y no se han detectado esquemas repetidos.</p>
                        )}
                    </div>
                </div>
                <div className="p-8 border-t bg-[#f8fafc] flex justify-between items-center">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">* Minuta generada por HidroScan Engine</p>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
                        <button
                            onClick={generatePDF}
                            disabled={repeatedNodes.length === 0 && missingNodes.length === 0}
                            className="px-10 py-4 bg-[#004071] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-[#88C13E] transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i className="fa-solid fa-file-pdf text-base"></i> Descargar Minuta
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuditReportModal;