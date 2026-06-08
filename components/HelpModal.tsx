import React from 'react';

interface HelpModalProps {
  onClose: () => void;
}

const sections = [
  {
    title: 'Flujo recomendado',
    items: [
      'Crea un proyecto y completa codigo, etapa, fecha, region, comuna y tipo de union HDPE.',
      'Crea capitulos para separar sectores, laminas o grupos de revision.',
      'Sube imagenes de cuadros de nudos y ejecuta el reconocimiento automatico.',
      'Revisa cada nudo antes de exportar: nombre, ID del plano, piezas, material, diametro, peso, mecanismo y uniones.',
      'Usa el resumen general del proyecto para detectar errores antes de generar tablas o APU.'
    ]
  },
  {
    title: 'Nudos y camaras',
    items: [
      'El ID debe conservar la nomenclatura del plano: 01, G-01, CV-1, CD-2 u otra definida por el proyecto.',
      'Los nudos numericos se revisan en la tabla de nudos. Camaras, grifos, ventosas, desagues, corte y otras nomenclaturas se revisan en la tabla de camaras.',
      'Las alertas marcan IDs duplicados, piezas incompletas, diametros faltantes o cantidades en cero.',
      'La flecha del proyecto despliega o contrae capitulos. Al apretar el nombre del proyecto se abre el resumen general.'
    ]
  },
  {
    title: 'Piezas',
    items: [
      'Cada fila representa una pieza instalada en el nudo o camara.',
      'Completa nombre, material, diametro, peso y cantidad.',
      'El material PVC esta disponible junto con HDPE, acero, fierro fundido, bronce, hormigon y otros.',
      'La casilla Mec. indica piezas con mecanismo, como valvulas, ventosas, reductoras o juntas autobloqueantes.',
      'Puedes corregir manualmente la cantidad de uniones si el detalle del plano requiere una excepcion.'
    ]
  },
  {
    title: 'Uniones',
    items: [
      'Las uniones se calculan por extremo de pieza y se agrupan al final de la tabla como categoria UNIONES.',
      'Codos, valvulas y piezas simples usan dos uniones del diametro principal.',
      'Tee 200x80 usa dos uniones de 200 y una de 80. Si el plano trae tres diametros, se usa una union por cada extremo.',
      'Reducciones usan una union por cada diametro.',
      'Stub end y copla usan una sola union.',
      'HDPE usa TF o EL segun la configuracion del proyecto. Acero, fierro fundido y bronce usan Brida.'
    ]
  },
  {
    title: 'Resumen general',
    items: [
      'La tabla integrada funciona como una matriz exportable para revisar cantidades por nudo o camara.',
      'Las columnas se separan por material; UNIONES aparece al final con color propio.',
      'Puedes filtrar por texto, ordenar por ID, nombre, capitulo, documento o priorizar errores.',
      'Usa Solo alertas cuando quieras revisar rapidamente problemas detectados.'
    ]
  },
  {
    title: 'Biblioteca y acciones',
    items: [
      'Guardar en biblioteca permite reutilizar un nudo tipo en otros proyectos o capitulos.',
      'Copiar nudo y Pegar sirven para repetir esquemas dentro del mismo proyecto.',
      'Desde Biblioteca tambien puedes reutilizar nudos existentes del proyecto activo.',
      'Eliminar borra el nudo o analisis seleccionado, por eso el programa pide confirmacion.'
    ]
  },
  {
    title: 'Exportaciones',
    items: [
      'Tabla genera una matriz de cantidades por nudo/camara.',
      'APU consolida piezas por material, mecanismo y uniones para preparar presupuesto.',
      'Antes de exportar, revisa el resumen general para corregir nomenclaturas, piezas incompletas o pesos en cero.',
      'La copia de seguridad guarda el proyecto completo en JSON para moverlo a otro equipo.'
    ]
  }
];

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => (
  <div className="fixed inset-0 bg-[#002d50]/80 backdrop-blur-md z-[280] flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col">
      <div className="px-8 py-6 bg-slate-50 border-b flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-[#004071] uppercase tracking-tighter">Guia de Uso</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Referencia interna para operar y revisar el programa</p>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-[#004071] hover:border-[#004071]">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div className="overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map(section => (
          <section key={section.title} className="border border-slate-200 rounded-2xl p-6 bg-white">
            <h3 className="text-sm font-black text-[#004071] uppercase tracking-widest mb-4">{section.title}</h3>
            <ul className="space-y-3">
              {section.items.map(item => (
                <li key={item} className="flex gap-3 text-xs leading-relaxed text-slate-600 font-semibold">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#88C13E] shrink-0"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  </div>
);

export default HelpModal;
