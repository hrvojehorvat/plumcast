import { list, num, obj, str } from './coerce';

export interface Programme {
  /** Unix ms. */
  start: number;
  end: number;
  title: string;
  description: string | null;
  /** Xtream archive listings say whether a replay exists (`has_archive`); unknown elsewhere. */
  archive?: boolean;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKS_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Base64 → UTF-8 text without atob/TextDecoder (not on every Hermes build). */
export function decodeBase64Utf8(input: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of input) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b >= 0xf0) cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xe0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xc0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else cp = 0xfffd;
    out += String.fromCodePoint(Number.isFinite(cp) ? cp : 0xfffd);
  }
  return out;
}

/** Xtream sends EPG titles base64-encoded; a few panels send them plain. */
function text(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  if (s.length % 4 === 0 && LOOKS_BASE64.test(s)) return decodeBase64Utf8(s).trim() || null;
  return s.trim();
}

/** `get_short_epg` / `get_simple_data_table` → programmes sorted by start. */
export function parseShortEpg(json: unknown): Programme[] {
  const out: Programme[] = [];
  for (const raw of list(obj(json).epg_listings)) {
    const p = obj(raw);
    const start = num(p.start_timestamp);
    const end = num(p.stop_timestamp ?? p.end_timestamp);
    const title = text(p.title);
    if (start === null || end === null || end <= start || !title) continue;
    const programme: Programme = { start: start * 1000, end: end * 1000, title, description: text(p.description) };
    const archive = num(p.has_archive);
    if (archive !== null) programme.archive = archive === 1;
    out.push(programme);
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface NowNext {
  now: Programme | null;
  next: Programme | null;
  /** 0..1 through the current programme. */
  progress: number;
}

export function nowNext(programmes: readonly Programme[], now = Date.now()): NowNext {
  const current = programmes.find((p) => p.start <= now && now < p.end) ?? null;
  const next = programmes.find((p) => p.start >= (current?.end ?? now)) ?? null;
  const progress = current ? (now - current.start) / (current.end - current.start) : 0;
  return { now: current, next, progress };
}
