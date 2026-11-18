import { fetch as expoFetch } from 'expo/fetch';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { PlaylistError, toPlaylistError } from '../core/errors';
import { createUtf8Decoder, XmltvParser } from '../core/xmltv';
import { xmltvUrl } from '../core/xtream';
import { invalidateProgrammes } from './epg';
import { guideChannelIds, readGuideStatus, saveGuide, type GuideRow, type GuideStatus } from './guideDb';
import { routeUrl } from './net';
import { readSecret, type Playlist } from './playlists';
import { loginFor } from './session';

/**
 * The full TV guide comes from an XMLTV file: the user's own link if set, else the provider's
 * (Xtream `xmltv.php`, M3U `url-tvg`). It is downloaded as a stream, only programmes of the
 * playlist's channels inside the kept window are stored, and it is refreshed every 12 hours.
 */

export const GUIDE_FRESH_MS = 12 * 60 * 60_000;
const RETRY_FAILED_MS = 10 * 60_000;
const KEEP_BACK_MS = 8 * 24 * 60 * 60_000;
const KEEP_AHEAD_MS = 14 * 24 * 60 * 60_000;
/** No data for this long = give up. */
const IDLE_TIMEOUT_MS = 60_000;

export type GuideProblem = 'no-source' | 'no-match' | PlaylistError['code'];

export interface GuideState {
  /** Stored status per playlist (undefined = not read yet, null = never loaded). */
  status: Record<number, GuideStatus | null | undefined>;
  syncing: { playlistId: number; phase: 'download' | 'save'; bytes: number; programmes: number } | null;
  /** Last failure per playlist. */
  problem: Record<number, { code: GuideProblem; at: number } | undefined>;
}

let state: GuideState = { status: {}, syncing: null, problem: {} };
const listeners = new Set<() => void>();
let controller: AbortController | null = null;

function set(patch: Partial<GuideState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useGuideState(): GuideState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Where this playlist's guide comes from, or null when it has none. Never stored in SQLite (may contain a login). */
export async function guideLink(playlist: Playlist): Promise<string | null> {
  const secret = await readSecret(playlist.id);
  if (secret.guideOverride) return secret.guideOverride;
  if (playlist.kind === 'xtream') {
    const login = await loginFor(playlist);
    return login ? xmltvUrl(login) : null;
  }
  return secret.guideUrl || null;
}

/** True when the playlist has its own guide link set by the user. */
export async function hasGuideOverride(playlist: Playlist): Promise<boolean> {
  return !!(await readSecret(playlist.id)).guideOverride;
}

async function loadStatus(playlistId: number) {
  if (state.status[playlistId] !== undefined) return state.status[playlistId];
  const status = await readGuideStatus(playlistId);
  set({ status: { ...state.status, [playlistId]: status } });
  return status;
}

/** Downloads the guide if it is missing or older than 12 hours (and didn't just fail). */
export async function ensureGuide(playlist: Playlist, now = Date.now()) {
  if (state.syncing) return;
  const status = await loadStatus(playlist.id).catch(() => null);
  const problem = state.problem[playlist.id];
  if (problem && now - problem.at < RETRY_FAILED_MS) return;
  if (status && now - status.fetchedAt < GUIDE_FRESH_MS) return;
  await syncGuide(playlist);
}

export function cancelGuideSync() {
  controller?.abort();
}

/** Forgets what is known about a playlist's guide in memory (after it was edited or removed). */
export function forgetGuide(playlistId: number) {
  const status = { ...state.status };
  const problem = { ...state.problem };
  delete status[playlistId];
  delete problem[playlistId];
  set({ status, problem });
}

/** Downloads and stores the guide now. Failures end up in `problem`; details only in the console. */
export async function syncGuide(playlist: Playlist) {
  if (state.syncing) return;
  const own = new AbortController();
  controller = own;
  const id = playlist.id;
  set({ syncing: { playlistId: id, phase: 'download', bytes: 0, programmes: 0 }, problem: { ...state.problem, [id]: undefined } });
  try {
    const link = await guideLink(playlist);
    if (!link) throw new GuideFailure('no-source');
    const channels = await guideChannelIds(id);
    let received = 0;
    const rows = await downloadGuide(link, channels, own.signal, (bytes, programmes) => {
      received = bytes;
      set({ syncing: { playlistId: id, phase: 'download', bytes, programmes } });
    });
    if (!rows.length) throw new GuideFailure('no-match');
    set({ syncing: { playlistId: id, phase: 'save', bytes: received, programmes: rows.length } });
    const status = await saveGuide(id, rows);
    set({ status: { ...state.status, [id]: status } });
    invalidateProgrammes(id);
  } catch (error) {
    const code: GuideProblem = error instanceof GuideFailure ? error.code : toPlaylistError(error).code;
    if (code !== 'cancelled') {
      console.warn('Plumcast guide update failed', code, error instanceof GuideFailure ? '' : error);
      set({ problem: { ...state.problem, [id]: { code, at: Date.now() } } });
    }
  } finally {
    if (controller === own) controller = null;
    set({ syncing: null });
  }
}

class GuideFailure extends Error {
  constructor(readonly code: GuideProblem) {
    super(code);
  }
}

const streamFetch: typeof expoFetch = Platform.OS === 'web' ? (globalThis.fetch as unknown as typeof expoFetch) : expoFetch;

async function downloadGuide(
  link: string,
  channels: Set<string>,
  signal: AbortSignal,
  onProgress: (bytes: number, programmes: number) => void,
): Promise<GuideRow[]> {
  const now = Date.now();
  const keepFrom = now - KEEP_BACK_MS;
  const keepTo = now + KEEP_AHEAD_MS;
  const rows: GuideRow[] = [];
  const parser = new XmltvParser((p) => {
    const channel = p.channel.toLowerCase();
    if (!channels.has(channel) || p.end < keepFrom || p.start > keepTo) return;
    rows.push([channel, p.start, p.end, p.title, p.description]);
  });

  const local = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      timedOut = true;
      local.abort();
    }, IDLE_TIMEOUT_MS);
  };
  const onAbort = () => local.abort();
  signal.addEventListener('abort', onAbort);
  touch();
  try {
    const res = await streamFetch(routeUrl(link), { signal: local.signal });
    if (res.status === 401 || res.status === 403) throw new PlaylistError('auth', `HTTP ${res.status}`, res.status);
    if (!res.ok) throw new PlaylistError('http', `HTTP ${res.status}`, res.status);
    if (!res.body) throw new PlaylistError('format', 'No body');
    const reader = (await maybeGunzip(res.body as ReadableStream<Uint8Array>)).getReader();
    const decode = createUtf8Decoder();
    let bytes = 0;
    let lastReport = 0;
    for (;;) {
      const { done, value } = await reader.read();
      touch();
      if (done) break;
      bytes += value.byteLength;
      parser.push(decode(value));
      if (Date.now() - lastReport > 250) {
        lastReport = Date.now();
        onProgress(bytes, rows.length);
      }
    }
    parser.push(decode(new Uint8Array(0), true));
    parser.end();
    onProgress(bytes, rows.length);
    return rows;
  } catch (error) {
    if (error instanceof PlaylistError) throw error;
    if (signal.aborted) throw new PlaylistError('cancelled');
    if (timedOut) throw new PlaylistError('timeout');
    throw new PlaylistError('network', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(idle);
    signal.removeEventListener('abort', onAbort);
  }
}

/** `.xml.gz` guides: unpacked where the platform can (browsers); elsewhere they can't be read. */
async function maybeGunzip(body: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader();
  const first = await reader.read();
  const rest = new ReadableStream<Uint8Array>({
    start(c) {
      if (!first.done) c.enqueue(first.value);
      else c.close();
    },
    async pull(c) {
      const { done, value } = await reader.read();
      if (done) c.close();
      else c.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  const gzip = !first.done && first.value[0] === 0x1f && first.value[1] === 0x8b;
  if (!gzip) return rest;
  if (typeof DecompressionStream === 'undefined') throw new PlaylistError('format', 'gzip not supported');
  return rest.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}

/** When the playlist's stored guide last changed (null = none). Cheap to use in every grid row. */
export function useGuideVersion(playlistId: number): number | null {
  const get = () => state.status[playlistId]?.fetchedAt ?? null;
  return useSyncExternalStore(subscribe, get, get);
}

/** Loads the stored status of the active playlist's guide. */
export function useGuideStatus(playlist: Playlist | null): GuideStatus | null | undefined {
  const s = useGuideState();
  useEffect(() => {
    if (playlist) void loadStatus(playlist.id).catch(() => undefined);
  }, [playlist]);
  return playlist ? s.status[playlist.id] : undefined;
}
