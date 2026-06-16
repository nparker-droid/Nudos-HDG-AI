import { CatalogItem } from '../types.ts';
import { normalizeText } from '../utils/normalization.ts';

// [términos del usuario, tipos en la BD] — todos se normalizan al comparar
const TYPE_SYNONYMS: Array<[string[], string[]]> = [
  [['CODO', 'CURVA', 'ELBOW', 'CURVE', 'CODITO'], ['CODO', 'CURVA']],
  [['TEE', 'TE ', 'RAMAL', 'BIFURCACION'], ['TEE']],
  [['REDUCCION', 'REDUCCION', 'BUJE', 'BUSHING', 'BUJE REDUCCION'], ['REDUCCION', 'BUJE REDUCCION', 'Y REDUCTOR']],
  [['COPLA', 'COUPLING', 'ACOPLAMIENTO'], ['COPLA', 'COPLA LARGO', 'COPLA LIGHTFIT', 'COPLA REPARACION']],
  [['UNION', 'JUNTA UNIVERSAL', 'JUNTA UNION'], ['UNION', 'COPLA']],
  [['PORTABRIDA', 'STUB END'], ['PORTABRIDA', 'STUB END']],
  [['VALVULA', 'VALVULA', 'VALVE'], ['VALVULA']],
  [['BRIDA', 'FLANGE'], ['BRIDA', 'FLANGE']],
  [['TUBERIA', 'TUBO', 'CANO', 'CANERIA', 'CANERIA', 'PIPE'], ['TUBERIA', 'TUBO']],
  [['JUNTA EXPANSION', 'JUNTA DE EXPANSION', 'EXPANSION'], ['JUNTA DE EXPANSION']],
  [['TAPING', 'COLLARIN', 'TAPPING'], ['TAPING TEE', 'COLLARIN']],
  [['TAPON', 'TAPAGORRO', 'CAP'], ['TAPON', 'TAPAGORRO']],
  [['TERMINAL'], ['TERMINAL']],
  [['ADAPTADOR', 'ADAPTER'], ['ADAPTADOR']],
];

// Material de la app → material(es) en la BD
const MATERIAL_MAP: Record<string, string[]> = {
  'HDPE':             ['HDPE'],
  'PEAD':             ['HDPE'],
  'PE':               ['HDPE'],
  'PVC':              ['PVC'],
  'PVCU':             ['PVC'],
  'PVC U':            ['PVC'],
  'PVC-U':            ['PVC'],
  'FE FDO':           ['FIERRO DUCTIL'],
  'FE.FDO':           ['FIERRO DUCTIL'],
  'FIERRO DUCTIL':    ['FIERRO DUCTIL'],
  'FD':               ['FIERRO DUCTIL'],
  'ACERO':            ['ACERO CARBONO', 'ACERO GALVANIZADO'],
  'ACERO CARBONO':    ['ACERO CARBONO'],
  'ACERO GALVANIZADO':['ACERO GALVANIZADO'],
  'GALVANIZADO':      ['ACERO GALVANIZADO'],
  'PP':               ['PP'],
  'POLIPROPILENO':    ['PP'],
  'BRONCE':           ['BRONCE'],
};

function resolveDbMaterials(mat: string): string[] {
  const n = normalizeText(mat);
  if (MATERIAL_MAP[n]) return MATERIAL_MAP[n].map(normalizeText);
  for (const [k, v] of Object.entries(MATERIAL_MAP)) {
    if (n.includes(k) || k.includes(n)) return v.map(normalizeText);
  }
  return [n];
}

function expandTypeTerms(name: string): string[] {
  const n = normalizeText(name);
  const result = new Set<string>([n]);
  for (const [userTerms, dbTerms] of TYPE_SYNONYMS) {
    const normUser = userTerms.map(normalizeText);
    if (normUser.some(t => n.includes(t) || t.includes(n))) {
      dbTerms.forEach(dt => result.add(normalizeText(dt)));
    }
  }
  return Array.from(result);
}

function parseLine(line: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur.trim());
  return parts;
}

// Columnas: CodigoID, Categoria, TipoPieza, Material, DiamMm, DiamPulg,
//           Resistencia, Union, PesoValor, PesoUnidad, Precio, Origen, Descripcion
export const parseCatalogCSV = (csvText: string): CatalogItem[] => {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];
  const items: CatalogItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const p = parseLine(line);
    if (p.length < 10) continue;
    const tipoPieza = p[2];
    if (!tipoPieza || tipoPieza === 'Tipo_Pieza') continue;

    const diametroMm = parseFloat(p[4]) || 0;
    const pesoValor  = parseFloat(p[8].replace(',', '.')) || 0;
    const precioRaw  = p[10] || '';
    const precio     = precioRaw ? parseFloat(precioRaw.replace(',', '.')) : null;

    items.push({
      id:          p[0] || `cat_${i}`,
      categoria:   p[1] || '',
      tipoPieza,
      material:    p[3] || '',
      diametroMm,
      diametroPulg: p[5] || '',
      resistencia: p[6] || '',
      union:       p[7] || '',
      pesoValor:   isNaN(pesoValor) ? 0 : pesoValor,
      pesoUnidad:  p[9] || 'kg',
      precio:      precio !== null && !isNaN(precio) ? precio : null,
      descripcion: p[12] || '',
    });
  }
  return items;
};

export interface CatalogMatch {
  weight:     number | null;
  price:      number | null;
  pesoUnidad: string;
  descripcion: string;
}

export const findInCatalog = (
  pieceName:     string,
  pieceDiameter: string,
  pieceMaterial: string,
  catalogItems:  CatalogItem[],
): CatalogMatch => {
  const empty: CatalogMatch = { weight: null, price: null, pesoUnidad: 'kg', descripcion: '' };
  if (!catalogItems?.length || !pieceName) return empty;

  const normMat    = normalizeText(pieceMaterial || '');
  const isWildcard = normMat === 'OTRO' || normMat === '';
  const dbMats     = resolveDbMaterials(pieceMaterial);
  const typeExp    = expandTypeTerms(pieceName);

  // 1. Filtro por material
  let pool = isWildcard
    ? catalogItems
    : catalogItems.filter(item => {
        const iM = normalizeText(item.material);
        return dbMats.some(dm => iM.includes(dm) || dm.includes(iM));
      });
  if (pool.length === 0) pool = catalogItems;

  // 2. Filtro por tipo de pieza (con sinónimos)
  const byType = pool.filter(item => {
    const iT = normalizeText(item.tipoPieza);
    return typeExp.some(t => iT === t || iT.includes(t) || t.includes(iT));
  });
  if (byType.length > 0) pool = byType;

  // 3. Filtro por diámetro
  const diam = (pieceDiameter || '').trim();
  if (diam) {
    const isInch = /"|pulg|inch/i.test(diam) || /\d+\/\d+/.test(diam);
    const mmNum  = parseFloat(diam.replace(/[^0-9.,]/g, '').replace(',', '.'));
    const pulgStr = diam.replace(/["""pulginch\s]/gi, '').trim();

    const byDiam = pool.filter(item => {
      if (isInch) {
        const ip = item.diametroPulg.trim();
        return ip === pulgStr || ip.startsWith(pulgStr) || pulgStr.startsWith(ip);
      }
      return !isNaN(mmNum) && Math.abs(item.diametroMm - mmNum) < 1;
    });
    if (byDiam.length > 0) pool = byDiam;
  }

  // 4. Scoring por similitud de nombre
  const searchTokens = normalizeText(pieceName).split(/\s+/).filter(t => t.length > 1);
  let best: CatalogItem | null = null;
  let bestScore = -1;

  for (const item of pool) {
    const iT = normalizeText(item.tipoPieza);
    let score = 0;
    if (typeExp.includes(iT)) score += 3;
    else if (typeExp.some(t => iT.includes(t))) score += 2;
    const iTokens = iT.split(/\s+/).filter(t => t.length > 1);
    for (const st of searchTokens) {
      if (iTokens.includes(st)) score += 1.5;
      else if (iTokens.some(it => it.includes(st) || st.includes(it))) score += 0.5;
    }
    if (score > bestScore) { bestScore = score; best = item; }
  }

  if (!best || bestScore < 0.5) return empty;
  return {
    weight:      best.pesoValor,
    price:       best.precio,
    pesoUnidad:  best.pesoUnidad,
    descripcion: best.descripcion,
  };
};

// Compatibilidad con código existente
export const findWeightInCatalog = (
  pieceName:     string,
  pieceDiameter: string,
  pieceMaterial: string,
  catalogItems:  CatalogItem[],
): number | null => findInCatalog(pieceName, pieceDiameter, pieceMaterial, catalogItems).weight;
