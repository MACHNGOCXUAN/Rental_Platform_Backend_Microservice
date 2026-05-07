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
  'chung cu': ['can ho', 'tap the', 'apartment'],
  'can ho': ['chung cu', 'studio', 'condo'],
  'nha tro': ['phong tro', 'nha thue'],
  'phong tro': ['nha tro', 'phong thue'],
  'dat nen': ['dat tho cu', 'dat du an'],
};

export const getSearchTerms = (keyword: string): string[] => {
  const normalized = normalizeText(keyword);
  const tokens = normalized.split(' ').filter(word => word.length > 1);
  const expanded = new Set<string>(tokens);

  // Check for multi-word synonyms
  Object.keys(SYNONYMS).forEach(phrase => {
    if (normalized.includes(phrase)) {
      SYNONYMS[phrase].forEach(s => {
        // Add all tokens of the synonym
        s.split(' ').forEach(t => expanded.add(t));
      });
    }
  });

  return Array.from(expanded);
};
