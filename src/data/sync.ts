import { PlaylistError } from '../core/errors';
import { getText } from '../core/http';
import { m3uToCatalog, parseM3u } from '../core/m3u';
import type { Catalog, PlaylistDraft } from '../core/models';
import { fetchXtreamCatalog, type SyncStep } from '../core/xtream';
import { appFetch } from './net';
import { readSecret, type Playlist } from './playlists';

/** Where a catalog comes from. Built from the form (add / edit) or from a saved playlist (refresh). */
export type CatalogSource =
  | { kind: 'xtream'; server: string; username: string; password: string }
  | { kind: 'm3u-url'; url: string }
  | { kind: 'm3u-text'; text: string };

export interface SyncProgress {
  step: SyncStep;
  /** 0-based position and number of steps, for a progress bar. */
  index: number;
  total: number;
}

export interface FetchOptions {
  signal?: AbortSignal;
  onProgress?: (progress: SyncProgress) => void;
}

/** Downloads and parses a catalog. Nothing is stored; throws PlaylistError on failure. */
export async function fetchCatalog(source: CatalogSource, { signal, onProgress }: FetchOptions = {}): Promise<Catalog> {
  let catalog: Catalog;
  if (source.kind === 'xtream') {
    catalog = await fetchXtreamCatalog(source, appFetch, { signal, onStep: (step, index, total) => onProgress?.({ step, index, total }) });
    onProgress?.({ step: 'save', index: 7, total: 8 });
  } else {
    let text: string;
    if (source.kind === 'm3u-url') {
      onProgress?.({ step: 'download', index: 0, total: 3 });
      text = await getText(appFetch, source.url, { signal, timeoutMs: 180_000 });
    } else {
      text = source.text;
    }
    onProgress?.({ step: 'parse', index: 1, total: 3 });
    catalog = m3uToCatalog(parseM3u(text));
    if (!catalog.live.length && !catalog.movies.length && !catalog.series.length) throw new PlaylistError('empty');
    onProgress?.({ step: 'save', index: 2, total: 3 });
  }
  if (signal?.aborted) throw new PlaylistError('cancelled');
  return catalog;
}

/** The source of a saved playlist, with the secret filled in from secure storage. */
export async function savedSource(playlist: Playlist): Promise<CatalogSource> {
  const secret = await readSecret(playlist.id);
  if (playlist.kind === 'xtream') {
    if (!playlist.server || !playlist.username || !secret.password) throw new PlaylistError('auth', 'Missing login');
    return { kind: 'xtream', server: playlist.server, username: playlist.username, password: secret.password };
  }
  if (playlist.kind === 'm3u-url' && secret.m3uUrl) return { kind: 'm3u-url', url: secret.m3uUrl };
  throw new PlaylistError('invalid-url', 'File playlists update by picking the file again');
}

/**
 * The source for a form draft. On edit, blank secret fields fall back to the saved ones
 * (only when the kind didn't change).
 */
export async function draftSource(draft: PlaylistDraft, fileText: string | null, saved: Playlist | null): Promise<CatalogSource> {
  const old = saved && saved.kind === draft.kind ? await readSecret(saved.id) : {};
  if (draft.kind === 'xtream') {
    const password = draft.secret.password || old.password;
    if (!draft.server || !draft.username || !password) throw new PlaylistError('auth', 'Missing login');
    return { kind: 'xtream', server: draft.server, username: draft.username, password };
  }
  if (draft.kind === 'm3u-url') {
    const url = draft.secret.m3uUrl || old.m3uUrl;
    if (!url) throw new PlaylistError('invalid-url');
    return { kind: 'm3u-url', url };
  }
  if (fileText === null) throw new PlaylistError('invalid-url', 'No file picked');
  return { kind: 'm3u-text', text: fileText };
}
