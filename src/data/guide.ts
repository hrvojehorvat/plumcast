import { fetch as expoFetch } from 'expo/fetch';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { createBreather } from '../core/breathe';
import { shouldAutoUpdate } from '../core/guideIdle';
import { PlaylistError, toPlaylistError } from '../core/errors';
import { createUtf8Decoder, XmltvParser } from '../core/xmltv';
import { xmltvUrl } from '../core/xtream';
import { getDb } from './db';
import { clearProgrammeCache, invalidateProgrammes } from './epg';
import { guideChannelIds, readGuideStatus, saveGuide, type GuideRow, type GuideStatus } from './guideDb';
import { routeUrl } from './net';
import { readSecret, type Playlist } from './playlists';
import { getPrefs } from './prefs';
import { loginFor } from './session';

/**
 * The full TV guide comes from an XMLTV file: the user's own link if set, else the provider's
 * (Xtream `xmltv.php`, M3U `url-tvg`). It is downloaded as a stream, only programmes of the
 * playlist's channels inside the kept window are stored, and it is refreshed every 12 hours.
 */

export const GUIDE_FRESH_MS = 12 * 60 * 60_000;
const RETRY_FAILED_MS = 3 * 60_000;
/** Providers sometimes refuse the guide for a moment (busy, rate limit): try again after these pauses. */
const RETRY_DELAYS_MS = [3_000, 10_000];
const KEEP_BACK_MS = 8 * 24 * 60 * 60_000;
const KEEP_AHEAD_MS = 14 * 24 * 60 * 60_000;
/** No data for this long = give up. */
const IDLE_TIMEOUT_MS = 60_000;
/** A downloaded chunk is parsed in slices this long, with a break for the UI when needed. */
const PARSE_SLICE = 64 * 1024;

export type GuideProblem = 'no-source' | 'no-login' | 'no-match' | PlaylistError['code'];

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

/**
 * Where this playlist's guide comes from, best first: the user's own link, then the provider's
 * (Xtream `xmltv.php`, M3U `url-tvg`). Never stored in SQLite (may contain a login).
 */
async function guideLinks(playlist: Playlist): Promise<string[]> {
  const secret = await readSecret(playlist.id);
  let own: string | null = secret.guideUrl || null;
  if (playlist.kind === 'xtream') {
    const login = await loginFor(playlist);
    own = login ? xmltvUrl(login) : null;
  }
  return [...new Set([secret.guideOverride, own].filter((l): l is string => !!l))];
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

/**
 * Opening the TV guide: downloads the guide if it is missing or older than 12 hours (and didn't just fail).
 * With "Update automatically" off, only a missing guide is downloaded. Counts as automatic: a video that
 * starts meanwhile stops it.
 */
export async function ensureGuide(playlist: Playlist, now = Date.now()) {
  if (state.syncing) return;
  const status = await loadStatus(playlist.id).catch(() => null);
  const problem = state.problem[playlist.id];
  if (problem && now - problem.at < RETRY_FAILED_MS) return;
  if (status && (!getPrefs().guideAuto || now - status.fetchedAt < GUIDE_FRESH_MS)) return;
  await runAuto(playlist);
}

export interface IdleNow {
  appActive: boolean;
  videosOnScreen: number;
  lastVideoEndedAt: number | null;
  playlistBusy: boolean;
}

/** The running download wasn't asked for by the user (so a starting video may stop it). */
let autoRunning = false;

async function runAuto(playlist: Playlist) {
  if (state.syncing) return;
  autoRunning = true;
  try {
    await syncGuide(playlist);
  } finally {
    autoRunning = false;
  }
}

/**
 * The idle check (src/guide/useGuideAutoUpdate.ts): downloads the guide when the app is idle and the
 * guide is missing or stale. `idle` is read after the stored status loaded, so a video that started
 * meanwhile still counts. The rules are in src/core/guideIdle.ts.
 */
export async function autoUpdateGuide(playlist: Playlist, idle: () => IdleNow) {
  const status = await loadStatus(playlist.id).catch(() => null);
  const now = idle();
  const go = shouldAutoUpdate({
    now: Date.now(),
    enabled: getPrefs().guideAuto,
    appActive: now.appActive,
    videosOnScreen: now.videosOnScreen,
    lastVideoEndedAt: now.lastVideoEndedAt,
    busy: now.playlistBusy || !!state.syncing,
    fetchedAt: status?.fetchedAt ?? null,
    lastFailureAt: state.problem[playlist.id]?.at ?? null,
    freshMs: GUIDE_FRESH_MS,
    retryFailedMs: RETRY_FAILED_MS,
  });
  if (go) await runAuto(playlist);
}

/** A video started or the app left the screen: stops a download the user didn't ask for. */
export function stopAutoUpdate() {
  if (autoRunning) controller?.abort();
}

/**
 * Settings → Clear cache: forgets every downloaded guide and the now/next kept in memory.
 * Playlists, favourites and progress stay; the guide downloads again when it is next needed.
 */
export async function clearGuideCache() {
  controller?.abort();
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM epg');
    await db.runAsync("DELETE FROM settings WHERE key LIKE 'guide:%'");
  });
  set({ status: {}, problem: {} });
  clearProgrammeCache();
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
    const links = await guideLinks(playlist);
    if (!links.length) throw new GuideFailure(playlist.kind === 'xtream' ? 'no-login' : 'no-source');
    const channels = await guideChannelIds(id);
    let received = 0;
    const rows = await downloadWithRetries(links, channels, own.signal, (bytes, programmes) => {
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

/** Tries each link, a refused or failed download again after a short pause, before giving up. */
async function downloadWithRetries(
  links: readonly string[],
  channels: Set<string>,
  signal: AbortSignal,
  onProgress: (bytes: number, programmes: number) => void,
): Promise<GuideRow[]> {
  let last: unknown = null;
  for (const link of links) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt) await pause(RETRY_DELAYS_MS[attempt - 1], signal);
      try {
        const rows = await downloadGuide(link, channels, signal, onProgress);
        if (rows.length || link === links[links.length - 1]) return rows;
        break; // this guide lists none of the channels: try the next link
      } catch (error) {
        if (signal.aborted) throw new PlaylistError('cancelled');
        console.warn('Plumcast guide download failed', toPlaylistError(error).code, `attempt ${attempt + 1}`);
        last = error;
        // A broken file won't get better by asking again: go to the next link.
        if (toPlaylistError(error).code === 'format') break;
      }
    }
  }
  throw last ?? new GuideFailure('no-match');
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener('abort', stop);
      resolve();
    }
    function stop() {
      clearTimeout(timer);
      reject(new PlaylistError('cancelled'));
    }
    signal.addEventListener('abort', stop, { once: true });
  });
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
  // Only this playlist's channels within the kept days: the rest is skipped before its title and
  // description are read (most of a provider's guide is other countries' channels).
  const parser = new XmltvParser(
    (p) => rows.push([p.channel.toLowerCase(), p.start, p.end, p.title, p.description]),
    (channel, start, end) => end >= keepFrom && start <= keepTo && channels.has(channel.toLowerCase()),
  );

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
    const breathe = createBreather();
    let bytes = 0;
    let lastReport = 0;
    for (;;) {
      const { done, value } = await reader.read();
      touch();
      if (done) break;
      bytes += value.byteLength;
      // Parsed in slices with breaks: a whole multi-MB chunk at once would freeze the remote.
      const text = decode(value);
      for (let at = 0; at < text.length; at += PARSE_SLICE) {
        parser.push(text.slice(at, at + PARSE_SLICE));
        await breathe();
      }
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
  // Only the stored status: download progress (several times a second) doesn't re-render the screen.
  const get = () => (playlist ? state.status[playlist.id] : undefined);
  const status = useSyncExternalStore(subscribe, get, get);
  useEffect(() => {
    if (playlist) void loadStatus(playlist.id).catch(() => undefined);
  }, [playlist]);
  return status;
}

/** True while this playlist's guide downloads or saves; changes only when that starts or ends. */
export function useGuideBusy(playlistId: number): boolean {
  const get = () => state.syncing?.playlistId === playlistId;
  return useSyncExternalStore(subscribe, get, get);
}
