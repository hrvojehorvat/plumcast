import { hashId, num } from './coerce';
import { PlaylistError } from './errors';
import type { Catalog, Category, ContentKind, LiveChannel, Movie, Series } from './models';

export interface M3uEntry {
  title: string;
  url: string;
  attrs: Record<string, string>;
  /** From a separate `#EXTGRP:` line, if any. */
  group: string | null;
}

export interface M3uFile {
  header: Record<string, string>;
  entries: M3uEntry[];
}

const ATTR_RE = /([A-Za-z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;

function parseAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of text.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
  return attrs;
}

/** Index of the comma that ends the attributes (commas inside quotes don't count). */
function titleComma(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      return i;
    }
  }
  return -1;
}

/** Parses M3U / M3U8 playlist text (`#EXTM3U`, `#EXTINF`, `#EXTGRP`, URL lines). */
export function parseM3u(text: string): M3uFile {
  const header: Record<string, string> = {};
  const entries: M3uEntry[] = [];
  let pending: { title: string; attrs: Record<string, string> } | null = null;
  let group: string | null = null;

  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTM3U')) {
      Object.assign(header, parseAttrs(line.slice(7)));
    } else if (line.startsWith('#EXTINF:')) {
      const body = line.slice(8);
      const comma = titleComma(body);
      const head = comma === -1 ? body : body.slice(0, comma);
      pending = { title: comma === -1 ? '' : body.slice(comma + 1).trim(), attrs: parseAttrs(head) };
    } else if (line.startsWith('#EXTGRP:')) {
      group = line.slice(8).trim() || null;
    } else if (!line.startsWith('#')) {
      entries.push({ title: pending?.title || pending?.attrs['tvg-name'] || line, url: line, attrs: pending?.attrs ?? {}, group });
      pending = null;
      group = null;
    }
  }
  return { header, entries };
}

const VOD_EXT = /\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm)(\?|$)/i;
const EPISODE = /\s*[-–|]?\s*S\d{1,2}\s*E\d{1,3}\b.*$/i;

/** Xtream-generated M3U links put movies under /movie/ and episodes under /series/. */
export function classifyEntry(url: string): ContentKind {
  if (/\/series\//i.test(url)) return 'series';
  if (/\/movie\//i.test(url)) return 'movie';
  if (VOD_EXT.test(url)) return 'movie';
  return 'live';
}

/** Days of catch-up for an entry, with header-level defaults. Mode without days → 7 days. */
function catchupOf(attrs: Record<string, string>, header: Record<string, string>) {
  const mode = attrs['catchup'] ?? attrs['catchup-type'] ?? header['catchup'] ?? header['catchup-type'] ?? null;
  const days = num(attrs['catchup-days'] ?? attrs['timeshift'] ?? attrs['tvg-rec'] ?? header['catchup-days'] ?? header['timeshift']);
  const source = attrs['catchup-source'] ?? header['catchup-source'] ?? null;
  if (days === 0 || mode === 'disabled' || mode === 'none') return null;
  if (!mode && !days) return null;
  return { mode: mode ?? 'default', source, days: days ?? 7 };
}

/** Turns a parsed M3U into the same catalog shape an Xtream sync produces. */
export function m3uToCatalog(file: M3uFile): Catalog {
  if (!file.entries.length) throw new PlaylistError('empty', 'The playlist has no entries');

  const categories: Category[] = [];
  const seenCats = new Set<string>();
  const categoryFor = (kind: ContentKind, name: string | null): string | null => {
    if (!name) return null;
    const key = `${kind}\u0000${name}`;
    if (!seenCats.has(key)) {
      seenCats.add(key);
      categories.push({ kind, id: name, name });
    }
    return name;
  };

  const live: LiveChannel[] = [];
  const movies: Movie[] = [];
  const seriesById = new Map<string, Series>();
  const usedIds = new Set<string>();
  const uniqueId = (url: string) => {
    let id = hashId(url);
    for (let n = 2; usedIds.has(id); n++) id = `${hashId(url)}-${n}`;
    usedIds.add(id);
    return id;
  };

  for (const entry of file.entries) {
    const { attrs, url } = entry;
    const groupName = attrs['group-title'] || entry.group;
    const logo = attrs['tvg-logo'] || null;
    const kind = classifyEntry(url);

    if (kind === 'live') {
      const catchup = catchupOf(attrs, file.header);
      live.push({
        id: uniqueId(url),
        num: num(attrs['tvg-chno']),
        name: entry.title,
        logo,
        categoryId: categoryFor('live', groupName),
        epgId: attrs['tvg-id'] || attrs['tvg-name'] || null,
        archive: catchup !== null,
        archiveDays: catchup?.days ?? 0,
        url,
        catchup: catchup && { mode: catchup.mode, source: catchup.source },
      });
    } else if (kind === 'movie') {
      movies.push({
        id: uniqueId(url),
        name: entry.title,
        logo,
        categoryId: categoryFor('movie', groupName),
        ext: VOD_EXT.exec(url)?.[1]?.toLowerCase() ?? null,
        rating: null,
        addedAt: null,
        url,
      });
    } else {
      // M3U has episodes, not series: group them by title without the "S01 E02" part.
      // (Episodes themselves are stored with the Series phase.)
      const name = entry.title.replace(EPISODE, '').trim() || entry.title;
      const categoryId = categoryFor('series', groupName);
      const id = hashId(`${categoryId ?? ''}\u0000${name}`);
      if (!seriesById.has(id)) {
        seriesById.set(id, { id, name, cover: logo, categoryId, rating: null, plot: null, year: null });
      }
    }
  }

  const epg = file.header['url-tvg'] || file.header['x-tvg-url'] || '';
  return {
    categories,
    live,
    movies,
    series: [...seriesById.values()],
    epgUrl: epg.split(',')[0]?.trim() || null,
    account: null,
  };
}
