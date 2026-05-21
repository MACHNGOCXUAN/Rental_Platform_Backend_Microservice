export const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const tokenizeKeyword = (keyword: string): string[] => {
  if (!keyword) return [];
  const normalized = normalizeText(keyword);
  return normalized.split(' ').filter(word => word.length > 1);
};

export const SYNONYMS: Record<string, string[]> = {
  'chung cu': ['can ho', 'tap the', 'apartment', 'căn hộ', 'chung cư'],
  'can ho': ['chung cu', 'studio', 'condo', 'căn hộ', 'chung cư'],
  'nha tro': ['phong tro', 'nha thue', 'nhà trọ', 'phòng trọ'],
  'phong tro': ['nha tro', 'phong thue', 'phòng trọ', 'nhà trọ'],
  'dat nen': ['dat tho cu', 'dat du an', 'đất nền', 'đất thổ cư'],
  'biet thu': ['villa', 'biệt thự', 'biet thu'],
  'van phong': ['office', 'văn phòng'],
  'nha nguyen can': ['nhà nguyên căn', 'nha rieng', 'nhà riêng'],
};

/**
 * Given a user keyword, returns an array of search terms.
 * Each term is searched individually (OR across fields, AND across terms).
 *
 * Key improvement: returns BOTH the original (accented) tokens AND the
 * normalized (unaccented) tokens so that Prisma `contains insensitive`
 * can match Vietnamese text stored with diacritics.
 */
export const getSearchTerms = (keyword: string): string[] => {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const normalized = normalizeText(trimmed);
  const normalizedTokens = normalized.split(' ').filter(w => w.length > 1);

  // Also keep the original (accented) tokens so they can match DB text with diacritics
  const originalTokens = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 1);

  const expanded = new Set<string>();

  // Add original tokens (with diacritics) - these match DB data directly
  originalTokens.forEach(t => expanded.add(t));

  // Add normalized tokens (without diacritics) - these match normalized DB data
  normalizedTokens.forEach(t => expanded.add(t));

  // Check for multi-word synonyms in the normalized text
  Object.keys(SYNONYMS).forEach(phrase => {
    if (normalized.includes(phrase)) {
      SYNONYMS[phrase].forEach(s => {
        // Add all tokens of the synonym (both accented and unaccented)
        s.split(' ').forEach(t => expanded.add(t));
      });
    }
  });

  return Array.from(expanded);
};

/**
 * Build a Prisma-compatible search clause with smart Vietnamese diacritics handling.
 *
 * Strategy: For each original word in the query, create an OR group that matches
 * either the accented or unaccented form. Then AND all word groups together.
 *
 * Example: "biệt thự hà nội"
 * → (biệt OR biet) AND (thự OR thu) AND (hà OR ha) AND (nội OR noi)
 *   each searched across title, description, address, district, city
 *
 * This ensures ALL words must appear (filtering out unrelated results)
 * while still matching Vietnamese text regardless of diacritics.
 */
export const buildSearchWhere = (keyword: string) => {
  const trimmed = keyword.trim();
  if (!trimmed) return undefined;

  // Get original tokens (with diacritics)
  const originalTokens = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 1);

  if (originalTokens.length === 0) return undefined;

  // Get normalized tokens (without diacritics)
  const normalized = normalizeText(trimmed);
  const normalizedTokens = normalized.split(' ').filter(w => w.length > 1);

  // Collect synonym tokens from multi-word synonym matches
  const synonymTerms: string[] = [];
  Object.keys(SYNONYMS).forEach(phrase => {
    if (normalized.includes(phrase)) {
      SYNONYMS[phrase].forEach(s => {
        synonymTerms.push(...s.split(' ').filter(t => t.length > 1));
      });
    }
  });

  const searchFields = ['title', 'description', 'address', 'district', 'city'] as const;

  // Build per-word clauses: for each word, match accented OR unaccented form
  const wordClauses = originalTokens.map((origToken, i) => {
    const normToken = normalizedTokens[i];
    const variants = new Set<string>();
    variants.add(origToken);
    if (normToken && normToken !== origToken) {
      variants.add(normToken);
    }

    // Each variant can match in any field → OR
    const variantClauses = Array.from(variants).flatMap(term =>
      searchFields.map(field => ({
        [field]: { contains: term, mode: 'insensitive' as const },
      }))
    );

    return { OR: variantClauses };
  });

  // If we have synonym matches, add them as an additional OR group
  // This allows the synonym to match even if original tokens don't all match
  if (synonymTerms.length > 0) {
    const synonymClauses = synonymTerms.flatMap(term =>
      searchFields.map(field => ({
        [field]: { contains: term, mode: 'insensitive' as const },
      }))
    );
    // The full query is: (word1 AND word2 AND ...) OR (synonym matches)
    return {
      OR: [
        { AND: wordClauses },
        { OR: synonymClauses },
      ]
    };
  }

  // All word clauses must match (AND)
  if (wordClauses.length === 1) {
    return wordClauses[0];
  }
  return { AND: wordClauses };
};
