import { CatalogItem } from '../types.ts';

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

// Normalizes text for better matching: removes accents, converts to uppercase
const normalizeText = (text: string) => {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
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

    // Clean diameter from things like "mm" or extra spaces
    let pDiam = pieceDiameter.trim().toUpperCase()
        .replace('MM', '')
        .trim();

    const isInch = pDiam.includes('"') || pDiam.includes('PULG') || pDiam.includes('INCH') || pDiam.includes('/');

    // Exact match string for searching within the diameter fields
    if (isInch) {
        pDiam = pDiam.replace('PULG', '').replace('INCHES', '').replace('INCH', '').trim();
        if (!pDiam.includes('"')) {
            // if they wrote "1/2" we assume they mean inches based on isInch logic, add quote
            pDiam += '"';
        }
    }

    // Filter by material first (allow partial matches if the catalog material is contained in piece, or viceversa)
    const filteredByMaterial = catalogItems.filter(item => {
        const iMat = normalizeText(item.material);
        return iMat.includes(nMat) || nMat.includes(iMat) ||
            (iMat === 'HDPE' && nMat === 'PEAD') ||
            (iMat === 'PEAD' && nMat === 'HDPE');
    });

    if (filteredByMaterial.length === 0) return null;

    // Filter by diameter
    const filteredByDiameter = filteredByMaterial.filter(item => {
        if (isInch) {
            // match against diameterInches Exact match or close
            return item.diameterInches.toUpperCase() === pDiam ||
                item.diameterInches.toUpperCase().includes(pDiam) ||
                pDiam.includes(item.diameterInches.toUpperCase());
        } else {
            // match against mm exact match
            return item.diameter === pDiam;
        }
    });

    const candidates = filteredByDiameter.length > 0 ? filteredByDiameter : filteredByMaterial;

    // Let's find the best name match. Simple token overlap technique.
    const nameTokens = nName.split(/\s+/);

    let bestMatch: CatalogItem | null = null;
    let maxScore = -1;

    for (const item of candidates) {
        const iNameTokens = normalizeText(item.name).split(/\s+/);
        let score = 0;

        // Check token intersection
        for (const nTok of nameTokens) {
            if (iNameTokens.includes(nTok)) {
                score++;
            }
        }

        if (score > maxScore) {
            maxScore = score;
            bestMatch = item;
        }
    }

    // Require at least some overlap in the name to return a valid weight (e.g. at least 1 keyword match like "CODO" or "TEE")
    if (bestMatch && maxScore > 0) {
        return bestMatch.weight;
    }

    return null;
};
