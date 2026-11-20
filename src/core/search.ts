/** Letters folded for search, so "cesko" finds "Česko" and "muenchen"-style typing isn't needed for "ü". */
const FOLD: Record<string, string> = {
  ä: 'a', á: 'a', à: 'a', â: 'a', ã: 'a', å: 'a', ą: 'a', æ: 'ae',
  ç: 'c', č: 'c', ć: 'c', ď: 'd', đ: 'd',
  é: 'e', è: 'e', ê: 'e', ë: 'e', ě: 'e', ę: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i', ł: 'l', ñ: 'n', ň: 'n', ń: 'n',
  ö: 'o', ó: 'o', ò: 'o', ô: 'o', õ: 'o', ø: 'o', ő: 'o', œ: 'oe',
  ř: 'r', š: 's', ś: 's', ß: 'ss', ť: 't',
  ü: 'u', ú: 'u', ù: 'u', û: 'u', ű: 'u', ů: 'u', ý: 'y', ÿ: 'y', ž: 'z', ź: 'z', ż: 'z',
};

/** Lower-case, accents removed, single spaces. Stored next to names and applied to queries. */
export function foldSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u0080-\uffff]/g, (c) => FOLD[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}

/** A LIKE pattern for "contains", with % and _ escaped (use with `ESCAPE '\\'`). */
export function likeContains(query: string): string {
  return `%${foldSearch(query).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Shortest query the full search runs for (one letter would match half the catalog). */
export const SEARCH_MIN = 2;

export const isSearchable = (query: string): boolean => foldSearch(query).length >= SEARCH_MIN;

/** Recent searches: newest first, no duplicates (ignoring case and accents), at most `max`. */
export function rememberSearch(list: readonly string[], query: string, max = 8): string[] {
  const text = query.replace(/\s+/g, ' ').trim();
  if (!isSearchable(text)) return [...list];
  const key = foldSearch(text);
  return [text, ...list.filter((q) => foldSearch(q) !== key)].slice(0, max);
}

/** Found programmes in the order people want them: on now, then coming up (soonest first), then past (newest first). */
export function orderProgrammeHits<T extends { programme: { start: number; end: number } }>(hits: readonly T[], now: number): T[] {
  const group = (h: T) => (h.programme.start <= now && now < h.programme.end ? 0 : h.programme.start > now ? 1 : 2);
  return [...hits].sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;
    return ga === 2 ? b.programme.start - a.programme.start : a.programme.start - b.programme.start;
  });
}
