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
 * Build a Prisma-compatible search clause that uses OR logic.
 * For each term, it searches across title, description, address, district, city.
 * Terms are combined with OR (not AND) so partial matches still return results.
 */
export const buildSearchWhere = (keyword: string) => {
  const terms = getSearchTerms(keyword);
  if (terms.length === 0) return undefined;

  // Use OR across all terms — any term matching any field counts
  // This prevents "biệt" AND "thự" requiring BOTH to appear (which fails
  // when only the accented version exists and only the unaccented token is generated)
  const allClauses = terms.flatMap(term => [
    { title: { contains: term, mode: 'insensitive' as const } },
    { description: { contains: term, mode: 'insensitive' as const } },
    { address: { contains: term, mode: 'insensitive' as const } },
    { district: { contains: term, mode: 'insensitive' as const } },
    { city: { contains: term, mode: 'insensitive' as const } },
  ]);

  return { OR: allClauses };
};
