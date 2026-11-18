/**
 * Streaming XMLTV reader. Big guides are 20–200 MB, so the text arrives in chunks and only
 * `<programme>` elements are kept (channel names come from the playlist, not the guide).
 */

export interface XmltvProgramme {
  /** The XMLTV channel id (matches Xtream `epg_channel_id` / M3U `tvg-id`). */
  channel: string;
  /** Unix ms. */
  start: number;
  end: number;
  title: string;
  description: string | null;
}

const OPEN = '<programme';
const CLOSE = '</programme>';

export class XmltvParser {
  private buffer = '';

  constructor(private readonly onProgramme: (programme: XmltvProgramme) => void) {}

  push(chunk: string) {
    this.buffer += chunk;
    this.drain();
  }

  /** Call once after the last chunk. */
  end() {
    this.drain();
    this.buffer = '';
  }

  private drain() {
    const buf = this.buffer;
    let pos = 0;
    for (;;) {
      const open = buf.indexOf(OPEN, pos);
      if (open < 0) {
        // Keep a short tail: "<programme" may be split across chunks.
        pos = Math.max(pos, buf.length - OPEN.length);
        break;
      }
      const tagEnd = buf.indexOf('>', open);
      if (tagEnd < 0) {
        pos = open;
        break;
      }
      if (buf[tagEnd - 1] === '/') {
        // <programme … /> has no title: skip it.
        pos = tagEnd + 1;
        continue;
      }
      const close = buf.indexOf(CLOSE, tagEnd);
      if (close < 0) {
        pos = open;
        break;
      }
      const programme = readProgramme(buf.slice(open + OPEN.length, tagEnd), buf.slice(tagEnd + 1, close));
      if (programme) this.onProgramme(programme);
      pos = close + CLOSE.length;
    }
    this.buffer = buf.slice(pos);
  }
}

/** Parses a whole XMLTV document at once (tests, small files). */
export function parseXmltv(text: string): XmltvProgramme[] {
  const out: XmltvProgramme[] = [];
  const parser = new XmltvParser((p) => out.push(p));
  parser.push(text);
  parser.end();
  return out;
}

function readProgramme(attrs: string, body: string): XmltvProgramme | null {
  const channel = attr(attrs, 'channel');
  const start = parseXmltvDate(attr(attrs, 'start'));
  const end = parseXmltvDate(attr(attrs, 'stop'));
  const title = element(body, 'title');
  if (!channel || start === null || end === null || end <= start || !title) return null;
  return { channel, start, end, title, description: element(body, 'desc') };
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attrs);
  if (!match) return null;
  return decodeXml(match[2] ?? match[3] ?? '').trim() || null;
}

/** Text of the first `<name …>…</name>` (titles can come in several languages; the first wins). */
function element(body: string, name: string): string | null {
  const open = body.indexOf(`<${name}`);
  if (open < 0) return null;
  const tagEnd = body.indexOf('>', open);
  if (tagEnd < 0 || body[tagEnd - 1] === '/') return null;
  const close = body.indexOf(`</${name}>`, tagEnd);
  if (close < 0) return null;
  let text = body.slice(tagEnd + 1, close);
  const cdata = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(text);
  text = cdata ? cdata[1] : decodeXml(text);
  return text.trim() || null;
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED[entity.toLowerCase()] ?? match;
  });
}

/** "20261118203000 +0100" → Unix ms. Without an offset the time is UTC (XMLTV spec). */
export function parseXmltvDate(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?:?(\d{2})?/.exec(value.trim());
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  const offsetMin = m[7] && m[8] ? (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + (m[9] ? +m[9] : 0)) : 0;
  return utc - offsetMin * 60_000;
}

/**
 * UTF-8 bytes → text across chunk borders (a character can be split between two chunks).
 * Uses TextDecoder where it exists, otherwise a small decoder (older Hermes builds).
 */
export function createUtf8Decoder(): (bytes: Uint8Array, final?: boolean) => string {
  if (typeof TextDecoder !== 'undefined') {
    const decoder = new TextDecoder('utf-8');
    return (bytes, final = false) => decoder.decode(bytes, { stream: !final });
  }
  let pending: number[] = [];
  return (bytes, final = false) => {
    const all = pending.length ? [...pending, ...bytes] : bytes;
    let out = '';
    let i = 0;
    while (i < all.length) {
      const b = all[i];
      const size = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (i + size > all.length) break;
      let cp: number;
      if (size === 1) cp = b < 0x80 ? b : 0xfffd;
      else if (size === 2) cp = ((b & 0x1f) << 6) | (all[i + 1] & 0x3f);
      else if (size === 3) cp = ((b & 0x0f) << 12) | ((all[i + 1] & 0x3f) << 6) | (all[i + 2] & 0x3f);
      else cp = ((b & 0x07) << 18) | ((all[i + 1] & 0x3f) << 12) | ((all[i + 2] & 0x3f) << 6) | (all[i + 3] & 0x3f);
      out += String.fromCodePoint(cp <= 0x10ffff ? cp : 0xfffd);
      i += size;
    }
    pending = Array.from(all.slice(i));
    if (final && pending.length) {
      out += '�';
      pending = [];
    }
    return out;
  };
}
