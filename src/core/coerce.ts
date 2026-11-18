/**
 * Xtream panels are loose with types: numbers arrive as strings, empty values as "", null or [],
 * booleans as 1/"1"/true. These helpers turn that into clean values.
 */

export function str(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Unix seconds (number or string) → ms. 0 / empty → null. */
export function unixMs(value: unknown): number | null {
  const n = num(value);
  return n && n > 0 ? n * 1000 : null;
}

/** Arrays come back as `[]`, `{}`, `null` or an object keyed by index; always return an array. */
export function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

export function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Small stable hash (FNV-1a, base 36) for ids derived from URLs. */
export function hashId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
