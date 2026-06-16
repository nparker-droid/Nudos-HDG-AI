import React, { useState } from 'react';

interface HelpModalProps {
  onClose: () => void;
}

/* ─── estructura de datos para las secciones ─── */
type Tag = { label: string; color: string };
type Row = { key: string; val: string; note?: string };
type Block =
  | { type: 'rows';    title?: string; rows: Row[] }
  | { type: 'tags';    title?: string; items: Tag[] }
  | { type: 'steps';   items: string[] }
  | { type: 'alert';   icon: string; text: string; level: 'info' | 'warn' | 'tip' }
  | { type: 'matrix';  cols: string[]; rows: [string, string[]][] };

interface Section {
  id:    string;
  icon:  string;
  label: string;
  badge?: string;
  blocks: Block[];
}

const SECTIONS: Section[] = [
  /* ── FLUJO ─────────────────────────────── */
  {
    id: 'flujo', icon: 'fa-solid fa-diagram-project', label: 'Flujo de trabajo',
    blocks: [
      {
        type: 'steps',
        items: [
          'Crear proyecto — código, etapa, fecha, región, tipo de unión HDPE',
          'Crear capítulos — separar sectores, láminas o grupos de revisión',
          'Subir imágenes de cuadros de nudos → análisis automático IA',
          'Revisar nudos — ID, nombre, piezas, material, diámetro, peso, mecanismo, uniones',
          'Resumen general del proyecto — detectar errores antes de exportar',
          'Exportar — Tabla resumen (matriz) o APU (presupuesto por material)',
        ],
      },
      {
        type: 'alert', level: 'tip', icon: 'fa-lightbulb',
        text: 'El resumen general actúa como auditoría integrada: filtra por alertas para detectar nudos incompletos, IDs duplicados o piezas sin peso antes de exportar.',
      },
    ],
  },

  /* ── NUDOS ──────────────────────────────── */
  {
    id: 'nudos', icon: 'fa-solid fa-circle-nodes', label: 'Nudos',
    blocks: [
      {
        type: 'rows', title: 'Tipos de nudo',
        rows: [
          { key: 'Numerico',  val: 'Nudo hidráulico estándar con ID numérico o alfanumérico' },
          { key: 'Corte',     val: 'Punto de aislamiento — válvulas de seccionamiento' },
          { key: 'Ventosa',   val: 'Dispositivo de expulsión/admisión de aire' },
          { key: 'Desague',   val: 'Punto de purga o vaciado de red' },
          { key: 'Reductora', val: 'Cámara reductora de presión' },
          { key: 'Grifo',     val: 'Hidrante o grifo de incendio' },
          { key: 'Camara',    val: 'Cámara de inspección o control' },
          { key: 'Otro',      val: 'Elemento especial no clasificado en las categorías anteriores' },
        ],
      },
      {
        type: 'rows', title: 'Reglas de ID',
        rows: [
          { key: 'Formato',     val: 'Conservar nomenclatura del plano', note: '01, G-01, CV-1, CD-2…' },
          { key: 'Múltiple',    val: 'IDs separados por coma si un nudo agrupa varios', note: '"01, 02, 03"' },
          { key: 'Normalización', val: 'El sistema ordena y rellena con ceros automáticamente' },
          { key: 'Duplicados',  val: 'Se detectan por tipo; un mismo ID puede existir en Numerico y Camara' },
        ],
      },
      {
        type: 'alert', level: 'warn', icon: 'fa-triangle-exclamation',
        text: 'Los IDs duplicados dentro del mismo tipo de nudo generan alerta ámbar. La tabla de resumen no puede distinguir nudos con el mismo ID.',
      },
    ],
  },

  /* ── PIEZAS ─────────────────────────────── */
  {
    id: 'piezas', icon: 'fa-solid fa-cubes', label: 'Piezas',
    blocks: [
      {
        type: 'rows', title: 'Atributos de pieza',
        rows: [
          { key: 'Nombre',    val: 'Tipo de componente', note: 'Codo 90°, Tee, Válvula compuerta…' },
          { key: 'Material',  val: 'HDPE / PVC / Fe Fdo / Acero / Bronce / Hormigón / Otro' },
          { key: 'Diámetro', val: 'Nominal en mm o pulgadas', note: '110 mm, 4", 3 1/2"' },
          { key: 'Peso',     val: 'Unitario en kg (fitting) o kg/m (tubería) — autocompleta desde catálogo' },
          { key: 'Precio',   val: 'CLP sin IVA — autocompleta desde catálogo BD_OPTIMIZADA' },
          { key: 'Cantidad', val: 'Unidades instaladas en el nudo' },
          { key: 'Mec.',     val: 'Marca piezas con mecanismo: válvulas, ventosas, reductoras, hidrantes' },
          { key: 'Uniones',  val: 'Número de uniones por pieza — editable manualmente' },
        ],
      },
      {
        type: 'tags', title: 'Materiales disponibles',
        items: [
          { label: 'HDPE',      color: 'bg-blue-100 text-blue-700' },
          { label: 'PVC',       color: 'bg-violet-100 text-violet-700' },
          { label: 'Fe Fdo',    color: 'bg-slate-100 text-slate-700' },
          { label: 'Acero',     color: 'bg-zinc-100 text-zinc-700' },
          { label: 'Bronce',    color: 'bg-amber-100 text-amber-700' },
          { label: 'Hormigón',  color: 'bg-stone-100 text-stone-700' },
          { label: 'Otro',      color: 'bg-slate-50 text-slate-500' },
        ],
      },
      {
        type: 'alert', level: 'tip', icon: 'fa-book-open',
        text: 'El ícono de libro en la celda de Peso busca automáticamente peso y precio en el catálogo integrado al hover. También se activa al cambiar nombre, material o diámetro.',
      },
    ],
  },

  /* ── UNIONES ────────────────────────────── */
  {
    id: 'uniones', icon: 'fa-solid fa-link', label: 'Lógica de Uniones',
    blocks: [
      {
        type: 'rows', title: 'Reglas de conteo por tipo de pieza',
        rows: [
          { key: 'Codo / Válvula / Pieza simple', val: '2 uniones — diámetro principal' },
          { key: 'Tee igual',                     val: '3 uniones — mismo diámetro' },
          { key: 'Tee reducción (3 diámetros)',   val: '1 unión por extremo (puede variar)' },
          { key: 'Reducción / Buje',              val: '2 uniones — un diámetro por extremo' },
          { key: 'Stub End / Copla / Portabrida', val: '1 unión' },
          { key: 'Tubería / Unión / Brida',       val: '0 uniones (sin extremo libre)' },
          { key: 'Anclaje / Hormigón',            val: '0 uniones' },
        ],
      },
      {
        type: 'rows', title: 'Tipo de unión según material',
        rows: [
          { key: 'HDPE — TF',    val: 'Termofusión (configuración por defecto en el proyecto)' },
          { key: 'HDPE — EL',    val: 'Electrofusión' },
          { key: 'PVC',          val: 'TF (Termofusión o Cementado)' },
          { key: 'Fe Fdo / Acero / Bronce', val: 'Brida' },
          { key: 'Hormigón',     val: 'Sin unión' },
        ],
      },
      {
        type: 'alert', level: 'info', icon: 'fa-circle-info',
        text: 'El conteo automático cubre la mayoría de los casos. Usa el campo editable "Uniones" en cada fila para corregir excepciones que el plano especifique de otra forma.',
      },
    ],
  },

  /* ── CATÁLOGO ───────────────────────────── */
  {
    id: 'catalogo', icon: 'fa-solid fa-database', label: 'Catálogo BD', badge: '1 222 items',
    blocks: [
      {
        type: 'rows', title: 'Columnas BD_OPTIMIZADA_NUDOS',
        rows: [
          { key: 'Codigo_ID',          val: 'Identificador único de SKU' },
          { key: 'Categoria',          val: 'Tuberias / Fittings / Bridas / Valvulas / Juntas de expansión' },
          { key: 'Tipo_Pieza',         val: 'Nombre técnico del componente' },
          { key: 'Material',           val: 'HDPE / PVC / Acero carbono / Fierro ductil / PP…' },
          { key: 'Diametro_mm',        val: 'Diámetro nominal en milímetros' },
          { key: 'Diametro_pulg',      val: 'Equivalencia en pulgadas' },
          { key: 'Resistencia',        val: 'PN10 / PN16 / STD / SCH40 / SDR…' },
          { key: 'Union',              val: 'EF / TF / S/R / Brida…' },
          { key: 'Peso_valor',         val: 'Valor numérico del peso' },
          { key: 'Peso_unidad',        val: 'kg (fitting) | kg/m (tubería)' },
          { key: 'Precio_sin_IVA_CLP', val: 'Precio de referencia — puede ser nulo' },
        ],
      },
      {
        type: 'rows', title: 'Sinónimos de matching',
        rows: [
          { key: 'CODO = CURVA',        val: 'Elbow, codito, curve' },
          { key: 'TUBERIA = CAÑERIA',   val: 'Tubo, caño, canería, pipe' },
          { key: 'COPLA = UNION',       val: 'Copla largo, lightfit, reparación, acoplamiento' },
          { key: 'BRIDA = FLANGE',      val: 'Portabrida, stub end' },
          { key: 'REDUCCION = BUJE',    val: 'Buje reducción, Y reductor, bushing' },
          { key: 'VALVULA',             val: 'Compuerta, bola, mariposa, retención, sostenedora' },
        ],
      },
      {
        type: 'rows', title: 'Alias de material',
        rows: [
          { key: 'HDPE / PEAD / PE', val: '→ HDPE en catálogo' },
          { key: 'Fe Fdo / FD',      val: '→ Fierro Ductil en catálogo' },
          { key: 'Acero',            val: '→ Acero carbono + Acero galvanizado' },
          { key: 'PVC / PVCU',       val: '→ PVC en catálogo' },
        ],
      },
    ],
  },

  /* ── EXPORTACIONES ──────────────────────── */
  {
    id: 'export', icon: 'fa-solid fa-file-export', label: 'Exportaciones',
    blocks: [
      {
        type: 'rows', title: 'Tabla Resumen (TABLA)',
        rows: [
          { key: 'Formato',    val: 'CSV con separador ";" — compatible con Excel' },
          { key: 'Filas',      val: 'Un nudo por fila, expandido si tiene múltiples IDs' },
          { key: 'Columnas',   val: 'Una columna por pieza única (Material × Tipo × Diámetro)' },
          { key: 'Totales',    val: 'Fila CANTIDAD TOTAL, PESO UNITARIO (kg), PESO TOTAL (kg)' },
          { key: 'Anclajes',   val: 'Columna independiente al final de cada fila' },
          { key: 'Alcance',    val: 'Por documento (botón TABLA en cada análisis) o por capítulo completo' },
        ],
      },
      {
        type: 'rows', title: 'APU — Análisis de Precios Unitarios',
        rows: [
          { key: 'Formato',    val: 'CSV agrupado por Material + Mecanismo' },
          { key: 'Columnas',   val: 'Nombre ; Unidad ; Cantidad ; Peso Unit.(kg) ; Precio Unit.(CLP s/IVA)' },
          { key: 'Precio',     val: 'Primero desde catálogo (piece.price), luego tabla de referencia interna' },
          { key: 'Unidades',   val: 'Un (unidades), m (tubería), m³ (hormigón)' },
          { key: 'Uniones',    val: 'Bloque separado al final de cada grupo de material' },
          { key: 'Alcance',    val: 'Exporta el capítulo activo completo' },
        ],
      },
      {
        type: 'alert', level: 'warn', icon: 'fa-triangle-exclamation',
        text: 'Revisar en Resumen General antes de exportar: piezas con peso = 0 afectan los totales; IDs duplicados generan filas solapadas en la tabla.',
      },
    ],
  },

  /* ── DRIVE ──────────────────────────────── */
  {
    id: 'drive', icon: 'fa-brands fa-google-drive', label: 'Drive & Backup',
    blocks: [
      {
        type: 'rows', title: 'Contenido del backup',
        rows: [
          { key: 'projects',     val: 'Todos los proyectos con categorías, análisis y nudos' },
          { key: 'libraryNodes', val: 'Biblioteca de nudos tipo reutilizables' },
          { key: 'credits',      val: 'Créditos de análisis IA consumidos' },
          { key: 'Catálogo',     val: 'No se incluye — se carga desde BD_OPTIMIZADA integrada' },
        ],
      },
      {
        type: 'rows', title: 'Carpeta en Drive',
        rows: [
          { key: 'Ruta',         val: 'Mi unidad / Nudos Hidrogestion / nudos-backup.json' },
          { key: 'Formato',      val: 'JSON v2.0 — legible y portable' },
          { key: 'Auto-save',    val: 'Cada 5 min mientras Drive esté conectado' },
          { key: 'Reconexión',   val: 'Silenciosa al recargar — token persiste 1 h en localStorage' },
        ],
      },
      {
        type: 'rows', title: 'Configuración requerida (una sola vez)',
        rows: [
          { key: '1. Google Cloud', val: 'Crear proyecto → habilitar Google Drive API' },
          { key: '2. OAuth Client', val: 'Tipo "Aplicación web" → agregar dominio Vercel como origen autorizado' },
          { key: '3. Vercel',       val: 'Environment Variable: VITE_GOOGLE_CLIENT_ID = <client_id>' },
          { key: '4. Redespliegue', val: 'Necesario si la variable se agregó post-deploy' },
        ],
      },
      {
        type: 'alert', level: 'info', icon: 'fa-circle-info',
        text: 'Cada proyecto tiene su propio OAuth Client ID. El Client ID de otra app (ej. APU-HDG) no puede reutilizarse a menos que el dominio de esta app esté en sus orígenes autorizados.',
      },
    ],
  },

  /* ── IA ─────────────────────────────────── */
  {
    id: 'ia', icon: 'fa-solid fa-microchip', label: 'Análisis IA',
    blocks: [
      {
        type: 'rows', title: 'Modelo y flujo',
        rows: [
          { key: 'Modelo',       val: 'Gemini 2.0 Flash — Google Generative AI' },
          { key: 'Entrada',      val: 'Imagen base64 + esquema JSON estructurado' },
          { key: 'Salida',       val: 'Array de nudos con piezas, materiales, diámetros y cantidades' },
          { key: 'Créditos',     val: '1 crédito por imagen procesada — se descuenta al completar' },
          { key: 'Concurrencia', val: 'Una solicitud a la vez por sesión (flag inFlight)' },
          { key: 'Reintento',    val: 'Botón re-analizar disponible en cada análisis completado' },
        ],
      },
      {
        type: 'rows', title: 'Recomendaciones de imagen',
        rows: [
          { key: 'Resolución',   val: 'Mínimo 1 000 × 700 px — cuadro de nudos legible' },
          { key: 'Contraste',    val: 'Fondo blanco, texto negro — evitar sellos o marcas de agua sobre datos' },
          { key: 'Recorte',      val: 'Incluir solo el cuadro de nudos, no el plano completo' },
          { key: 'Formato',      val: 'JPG, PNG, WebP — máx. recomendado: 5 MB' },
        ],
      },
      {
        type: 'alert', level: 'tip', icon: 'fa-lightbulb',
        text: 'Si el reconocimiento falla o produce nudos incompletos, usa "Agregar Nudo" para ingresar datos manualmente. Los nudos manuales se identifican con indicador morado.',
      },
    ],
  },
];

/* ─── componentes de bloque ─── */
const LevelStyle = {
  info: { bar: 'border-blue-400 bg-blue-50',  icon: 'text-blue-500'  },
  warn: { bar: 'border-amber-400 bg-amber-50', icon: 'text-amber-500' },
  tip:  { bar: 'border-[#88C13E] bg-green-50', icon: 'text-[#88C13E]' },
};

const BlockRenderer: React.FC<{ block: Block }> = ({ block }) => {
  if (block.type === 'rows') return (
    <div className="mb-5">
      {block.title && <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.18em] mb-2">{block.title}</p>}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        {block.rows.map((r, i) => (
          <div key={i} className={`flex items-baseline gap-3 px-4 py-2.5 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
            <span className="text-[10px] font-black text-[#004071] whitespace-nowrap min-w-[140px] shrink-0">{r.key}</span>
            <span className="text-[11px] text-slate-600 font-medium leading-snug">{r.val}</span>
            {r.note && <span className="text-[9px] text-slate-400 font-mono ml-auto shrink-0">{r.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );

  if (block.type === 'tags') return (
    <div className="mb-5">
      {block.title && <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.18em] mb-2">{block.title}</p>}
      <div className="flex flex-wrap gap-2">
        {block.items.map((t, i) => (
          <span key={i} className={`text-[10px] font-black px-3 py-1 rounded-full ${t.color}`}>{t.label}</span>
        ))}
      </div>
    </div>
  );

  if (block.type === 'steps') return (
    <div className="mb-5">
      <ol className="space-y-2">
        {block.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-[#004071] text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <span className="text-[11px] text-slate-600 font-medium leading-snug pt-0.5">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  if (block.type === 'alert') {
    const s = LevelStyle[block.level];
    return (
      <div className={`flex gap-3 px-4 py-3 rounded-xl border-l-4 mb-4 ${s.bar}`}>
        <i className={`fa-solid ${block.icon} text-sm mt-0.5 shrink-0 ${s.icon}`}></i>
        <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{block.text}</p>
      </div>
    );
  }

  return null;
};

/* ─── modal principal ─── */
const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const [activeId, setActiveId] = useState('flujo');
  const active = SECTIONS.find(s => s.id === activeId)!;

  return (
    <div className="fixed inset-0 bg-[#002d50]/80 backdrop-blur-md z-[280] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col">

        {/* header */}
        <div className="px-8 py-5 bg-[#004071] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <i className="fa-solid fa-book-open text-white text-sm"></i>
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tighter leading-none">Referencia técnica</h2>
              <p className="text-[9px] font-bold text-[#88C13E] uppercase tracking-widest mt-0.5">NUDOS HIDROGESTION · MANUAL DE OPERACIÓN</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors flex items-center justify-center">
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* body: sidebar + content */}
        <div className="flex flex-grow overflow-hidden">

          {/* sidebar nav */}
          <nav className="w-52 shrink-0 bg-slate-50 border-r border-slate-100 py-4 overflow-y-auto">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all group ${
                  activeId === s.id
                    ? 'bg-white border-r-2 border-[#004071] text-[#004071]'
                    : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                }`}
              >
                <i className={`${s.icon} text-xs w-4 text-center ${activeId === s.id ? 'text-[#004071]' : 'text-slate-400 group-hover:text-slate-600'}`}></i>
                <span className="text-[10px] font-black uppercase tracking-wider flex-grow">{s.label}</span>
                {s.badge && (
                  <span className="text-[8px] font-black bg-[#88C13E]/20 text-[#5a8a2a] px-1.5 py-0.5 rounded-full">{s.badge}</span>
                )}
              </button>
            ))}
          </nav>

          {/* content */}
          <div className="flex-grow overflow-y-auto p-8 bg-white">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl bg-[#004071]/10 flex items-center justify-center">
                <i className={`${active.icon} text-[#004071] text-xs`}></i>
              </div>
              <div>
                <h3 className="text-sm font-black text-[#004071] uppercase tracking-tight">{active.label}</h3>
                {active.badge && <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{active.badge}</span>}
              </div>
            </div>

            {active.blocks.map((block, i) => (
              <BlockRenderer key={i} block={block} />
            ))}
          </div>
        </div>

        {/* footer */}
        <div className="px-8 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
            HDG Engineering · {new Date().getFullYear()}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#004071] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#002D50] transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};

export default HelpModal;
