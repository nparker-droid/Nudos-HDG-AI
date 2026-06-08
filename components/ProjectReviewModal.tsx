import React, { useMemo } from 'react';
import { Piece, Project } from '../types.ts';

interface ProjectReviewModalProps {
  project: Project;
  onClose: () => void;
}

const normalizeText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

const splitNodeIds = (id: string) => id.split(',').map(part => part.trim()).filter(Boolean);

const getSectionLabel = (type: string) => {
  const labels: Record<string, string> = {
    Numerico: 'Nudos',
    Corte: 'Camaras de Corte',
    Ventosa: 'Camaras de Ventosa',
    Desague: 'Camaras de Desague',
    Reductora: 'Valvulas Reductoras',
    Grifo: 'Camaras de Grifo',
    Camara: 'Camaras del Plano',
    Otro: 'Otros'
  };
  return labels[type] || type || 'Otros';
};

const mechanismKeywords = ['VALVULA', 'VENTOSA', 'REDUCTORA', 'JUNTA AUTOBLOQUEANTE', 'AUTOBLOQUEANTE', 'HIDRANTE', 'GRIFO'];
const noAutoUnionKeywords = ['UNION', 'BRIDA', 'FLANGE', 'JUNTA', 'PERNO', 'PERNOS', 'TUBO', 'CANERIA', 'CAÑERIA', 'HORMIGON', 'ANCLAJE'];

const inferHasMechanism = (piece: Piece) => {
  const name = normalizeText(piece.name || '');
  return mechanismKeywords.some(keyword => name.includes(keyword));
};

const getUnionCount = (piece: Piece) => {
  if (typeof piece.unionCount === 'number') return piece.unionCount;
  const name = normalizeText(piece.name || '');
  if (!name || noAutoUnionKeywords.some(keyword => name.includes(keyword))) return 0;
  return 2;
};

const getUnionKind = (piece: Piece, project: Project) => {
  const material = normalizeText(String(piece.material || ''));
  if (material.includes('HDPE') || material.includes('PEAD')) return project.hdpeUnionType || 'TF';
  if (material.includes('PVC')) return 'PVC';
  if (material.includes('ACERO') || material.includes('FDO') || material.includes('FIERRO') || material.includes('BRONCE')) return 'Brida';
  return 'Brida';
};

const ProjectReviewModal: React.FC<ProjectReviewModalProps> = ({ project, onClose }) => {
  const rows = useMemo(() => {
    const idCount = new Map<string, number>();
    project.categories.forEach(category => {
      category.analyses.forEach(analysis => {
        analysis.result?.nodes.forEach(node => {
          splitNodeIds(node.id).forEach(id => {
            const key = `${node.type || 'Otro'}:${normalizeText(id)}`;
            idCount.set(key, (idCount.get(key) || 0) + 1);
          });
        });
      });
    });

    return project.categories.flatMap(category =>
      category.analyses.flatMap((analysis, analysisIndex) =>
        (analysis.result?.nodes || []).flatMap(node => {
          const ids = splitNodeIds(node.id);
          const displayIds = ids.length > 0 ? ids : [node.id];
          return displayIds.flatMap(id =>
            node.pieces.length > 0
              ? node.pieces.map(piece => {
                  const duplicate = idCount.get(`${node.type || 'Otro'}:${normalizeText(id)}`)! > 1;
                  const hasMechanism = piece.hasMechanism ?? inferHasMechanism(piece);
                  const unionCount = getUnionCount(piece);
                  const alerts = [
                    duplicate ? 'ID duplicado' : '',
                    !piece.name ? 'Sin pieza' : '',
                    !piece.material ? 'Sin material' : '',
                    !piece.diameter ? 'Sin diametro' : '',
                    piece.quantity <= 0 ? 'Cantidad cero' : '',
                    (piece.weight ?? 0) === 0 ? 'Peso cero' : ''
                  ].filter(Boolean);

                  return {
                    section: getSectionLabel(node.type),
                    category: category.name,
                    document: analysis.customName || `Documento ${analysisIndex + 1}`,
                    id,
                    nodeName: node.nodeName,
                    type: node.type || 'Otro',
                    pieceName: piece.name || '',
                    material: piece.material || '',
                    diameter: piece.diameter || '',
                    union: `${unionCount} ${getUnionKind(piece, project)}`,
                    quantity: piece.quantity || 0,
                    weight: piece.weight ?? 0,
                    mechanism: hasMechanism ? 'Con mecanismo' : 'Sin mecanismo',
                    alerts: alerts.join(', ')
                  };
                })
              : [{
                  section: getSectionLabel(node.type),
                  category: category.name,
                  document: analysis.customName || `Documento ${analysisIndex + 1}`,
                  id,
                  nodeName: node.nodeName,
                  type: node.type || 'Otro',
                  pieceName: '',
                  material: '',
                  diameter: '',
                  union: '',
                  quantity: 0,
                  weight: 0,
                  mechanism: '',
                  alerts: 'Nudo sin piezas'
                }]
          );
        })
      )
    ).sort((a, b) =>
      a.section.localeCompare(b.section, undefined, { numeric: true }) ||
      a.id.localeCompare(b.id, undefined, { numeric: true }) ||
      a.pieceName.localeCompare(b.pieceName)
    );
  }, [project]);

  return (
    <div className="fixed inset-0 bg-[#002d50]/85 backdrop-blur-md z-[260] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-[96vw] h-[90vh] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col">
        <div className="px-8 py-5 border-b bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-black text-[#004071] uppercase tracking-tighter">Revision General del Proyecto</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{project.name} / {rows.length} filas revisables</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-[#004071] hover:border-[#004071]">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex-grow overflow-auto">
          <table className="min-w-[1500px] w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[#004071] text-white uppercase text-[9px] tracking-widest">
              <tr>
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3">Capitulo</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">ID Plano</th>
                <th className="px-4 py-3">Nombre Nudo</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Pieza</th>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Diam.</th>
                <th className="px-4 py-3">Uniones</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3 text-right">Peso</th>
                <th className="px-4 py-3">Mecanismo</th>
                <th className="px-4 py-3">Alertas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-6 py-16 text-center text-slate-400 font-bold">No hay nudos analizados en este proyecto.</td>
                </tr>
              ) : rows.map((row, index) => (
                <tr key={`${row.id}-${row.pieceName}-${index}`} className={row.alerts ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-3 font-black text-[#004071]">{row.section}</td>
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="px-4 py-3">{row.document}</td>
                  <td className="px-4 py-3 font-black text-[#88C13E]">{row.id}</td>
                  <td className="px-4 py-3 font-bold text-[#004071]">{row.nodeName}</td>
                  <td className="px-4 py-3">{row.type}</td>
                  <td className="px-4 py-3 font-bold">{row.pieceName}</td>
                  <td className="px-4 py-3">{row.material}</td>
                  <td className="px-4 py-3 font-mono">{row.diameter}</td>
                  <td className="px-4 py-3">{row.union}</td>
                  <td className="px-4 py-3 text-right font-black">{row.quantity || ''}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.weight ? row.weight.toFixed(2) : ''}</td>
                  <td className="px-4 py-3">{row.mechanism}</td>
                  <td className="px-4 py-3 text-amber-700 font-bold">{row.alerts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProjectReviewModal;
