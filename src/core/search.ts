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
