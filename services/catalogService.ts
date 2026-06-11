import { CatalogItem } from '../types.ts';
import { normalizeText } from '../utils/normalization.ts';

export const parseCatalogCSV = (csvText: string): CatalogItem[] => {
    const lines = csvText.split('\n');
    if (lines.length < 2) return [];

    const items: CatalogItem[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // More robust split that handles optional quotes and semicolons
        const parts: string[] = [];
        let curStr = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ';' && !inQuotes) {
                parts.push(curStr);
                curStr = '';
            } else {
                curStr += char;
            }
        }
        parts.push(curStr); // add the last part

        if (parts.length >= 5) {
            const name = parts[0].trim().replace(/^"|"$/g, '');
            const diameter = parts[1].trim().replace(/^"|"$/g, '');

            let weightRaw = parts[2].trim().replace(/^"|"$/g, '');
            if (weightRaw.includes(',')) weightRaw = weightRaw.replace(',', '.');

            const weight = weightRaw ? parseFloat(weightRaw) : 0; // default to 0 if no weight

            let diameterInches = parts[3].trim();
            // Clean up extra quotes, it's often saved as """1/2""" or "1/2"
            diameterInches = diameterInches.replace(/^"+|"+$/g, '').trim();

            const material = parts[4].trim().replace(/^"|"$/g, '');

            // Ensure name exists
            if (name) {
                items.push({
                    id: `cat_${Date.now()}_${i}`,
                    name,
                    diameter,
                    weight: isNaN(weight) ? 0 : weight,
                    diameterInches,
                    material
                });
            }
        }
    }

    return items;
};


export const findWeightInCatalog = (
    pieceName: string,
    pieceDiameter: string,
    pieceMaterial: string,
    catalogItems: CatalogItem[]
): number | null => {
    if (!catalogItems || catalogItems.length === 0) return null;

    const nName = normalizeText(pieceName);
    const nMat = normalizeText(pieceMaterial);

    // 1. Normalize Search Diameter
    let pDiamValue = pieceDiameter.trim().toUpperCase()
        .replace(/MM/g, '')
        .replace(/"/g, '')
        .replace(/PULG/g, '')
        .replace(/INCH/g, '')
        .replace(/'/g, '')
        .trim();

    const isInputInch = pieceDiameter.includes('"') || pieceDiameter.toUpperCase().includes('PULG') || pieceDiameter.toUpperCase().includes('INCH') || pieceDiameter.includes('/');

    const mmToInches: Record<string, string> = {
        '20': '1/2"', '25': '3/4"', '32': '1"', '40': '1 1/4"', '50': '1 1/2"',
        '63': '2"', '75': '2 1/2"', '90': '3"', '110': '4"', '125': '5"',
        '140': '5"', '160': '6"', '180': '7"', '200': '8"', '225': '9"',
        '250': '10"', '280': '11"', '315': '12"', '355': '14"', '400': '16"'
    };

    const inchesToMm: Record<string, string> = {
        '1/2': '20', '3/4': '25', '1': '32', '1 1/4': '40', '1 1/2': '50',
        '2': '63', '2 1/2': '75', '3': '90', '4': '110', '5': '140',
        '6': '160', '8': '200', '10': '250', '12': '315', '14': '355', '16': '400',
        '24': '600'
    };

    // 2. Initial Filter by Material (Flexible)
    let candidates = catalogItems.filter(item => {
        const iMat = normalizeText(item.material);
        // Direct match or common aliases
        if (iMat === nMat || nMat === iMat) return true;
        if ((iMat === 'HDPE' && nMat === 'PEAD') || (iMat === 'PEAD' && nMat === 'HDPE')) return true;
        if (['PVC', 'PVCU', 'PVC-U', 'P.V.C'].includes(iMat) && ['PVC', 'PVCU', 'PVC-U', 'P.V.C'].includes(nMat)) return true;
        if (nMat === 'OTRO') return true; // Allow everything if piece is "Otro"
        return iMat.includes(nMat) || nMat.includes(iMat);
    });

    if (candidates.length === 0) candidates = catalogItems; // Fallback to full catalog if no material match

    // 3. Diameter Matching
    const findByDiameter = (items: CatalogItem[], val: string, isInch: boolean) => {
        return items.filter(item => {
            const iMm = item.diameter.trim();
            const iInch = item.diameterInches.replace(/"/g, '').trim();
            const searchVal = val.replace(/"/g, '').trim();

            if (isInch) {
                return iInch === searchVal || iInch.startsWith(searchVal) || searchVal.startsWith(iInch);
            } else {
                return iMm === searchVal;
            }
        });
    };

    let diameterMatches = findByDiameter(candidates, pDiamValue, isInputInch);

    // Try conversion if no radial match
    if (diameterMatches.length === 0) {
        if (!isInputInch && mmToInches[pDiamValue]) {
            diameterMatches = findByDiameter(candidates, mmToInches[pDiamValue], true);
        } else if (isInputInch && inchesToMm[pDiamValue]) {
            diameterMatches = findByDiameter(candidates, inchesToMm[pDiamValue], false);
        }
    }

    if (diameterMatches.length > 0) candidates = diameterMatches;

    // 4. Name Similarity Scoring
    const searchString = `${nName} ${nMat} ${pDiamValue}`.replace(/°/g, '');
    const searchTokens = searchString.split(/\s+/).filter(t => t.length > 1); // Ignore single chars

    let bestMatch: CatalogItem | null = null;
    let maxScore = -1;

    for (const item of candidates) {
        const iNameNormalized = normalizeText(item.name).replace(/°/g, '');
        const iTokens = iNameNormalized.split(/\s+/).filter(t => t.length > 1);

        let score = 0;
        for (const sTok of searchTokens) {
            if (iTokens.some(iTok => iTok.includes(sTok) || sTok.includes(iTok))) {
                score += 1;
                // Extra weight for exact token match
                if (iTokens.includes(sTok)) score += 0.5;
            }
        }

        if (score > maxScore) {
            maxScore = score;
            bestMatch = item;
        }
    }

    // Min score threshold
    if (bestMatch && maxScore >= 1) {
        return bestMatch.weight;
    }

    return null;
};
