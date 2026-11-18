import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { nowNext, parseShortEpg, type NowNext, type Programme } from '../core/epg';
import { shiftProgrammes } from '../core/guide';
import { getJson } from '../core/http';
import { apiUrl } from '../core/xtream';
import { upcomingByChannel } from './guideDb';
import { appFetch } from './net';
import { readSecret, type Playlist } from './playlists';
import { usePrefs } from './prefs';
import { loginFor } from './session';

/**
 * Now/next for channel rows. Xtream: from `get_short_epg` (small, always current), falling back
 * to the stored guide. M3U, or a playlist with its own guide link: from the stored guide.
 * Fetched lazily for rows that are on screen, at most a few at a time, newest request first
 * (the rows the user is looking at now). Times are stored as sent; the user's guide offset is
 * applied when they are read.
 */
interface Entry {
  programmes: Programme[];
  fetchedAt: number;
  failed: boolean;
}

const MAX_PARALLEL = 4;
const FRESH_MS = 2 * 60 * 60_000;
const RETRY_FAILED_MS = 10 * 60_000;
const MIN_REFETCH_MS = 60_000;

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const queued = new Map<string, () => Promise<void>>();
let running = 0;

const keyOf = (playlistId: number, channelId: string) => `${playlistId}:${channelId}`;

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function needsFetch(entry: Entry | undefined, now: number): boolean {
  if (!entry) return true;
  const age = now - entry.fetchedAt;
  if (entry.failed) return age > RETRY_FAILED_MS;
  if (age < MIN_REFETCH_MS) return false;
  if (age > FRESH_MS) return true;
  // Ran out of programmes (the short EPG only covers a few hours). No guide at all: ask again later.
  const last = entry.programmes[entry.programmes.length - 1];
  return last ? last.end < now : age > RETRY_FAILED_MS;
}

function pump() {
  while (running < MAX_PARALLEL && queued.size) {
    // Newest request first: Map keeps insertion order, so take the last one.
    const [key, job] = [...queued.entries()][queued.size - 1];
    queued.delete(key);
    running++;
    void job().finally(() => {
      running--;
      pump();
    });
  }
}

/** Xtream playlists use the short EPG unless the user set their own guide link. */
const usesShortEpg = new WeakMap<Playlist, Promise<boolean>>();
function shortEpgFor(playlist: Playlist): Promise<boolean> {
  let p = usesShortEpg.get(playlist);
  if (!p) {
    p = playlist.kind === 'xtream' ? readSecret(playlist.id).then((s) => !s.guideOverride, () => true) : Promise.resolve(false);
    usesShortEpg.set(playlist, p);
  }
  return p;
}

async function loadProgrammes(playlist: Playlist, channelId: string): Promise<Programme[]> {
  if (await shortEpgFor(playlist)) {
    try {
      const login = await loginFor(playlist);
      if (!login) throw new Error('no login');
      const json = await getJson(appFetch, apiUrl(login, 'get_short_epg', { stream_id: channelId, limit: 8 }), { timeoutMs: 15_000 });
      const list = parseShortEpg(json);
      if (list.length) return list;
    } catch (error) {
      const stored = await upcomingByChannel(playlist.id, channelId, Date.now() - 6 * 3_600_000).catch(() => []);
      if (stored.length) return stored;
      throw error;
    }
  }
  return upcomingByChannel(playlist.id, channelId, Date.now() - 6 * 3_600_000);
}

/** Drops cached programmes of a playlist (its guide was just downloaded again). */
export function invalidateProgrammes(playlistId: number) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${playlistId}:`)) {
      cache.delete(key);
      notify(key);
    }
  }
}

function request(playlist: Playlist, channelId: string) {
  const key = keyOf(playlist.id, channelId);
  if (!needsFetch(cache.get(key), Date.now())) return;
  queued.delete(key); // re-insert at the end = most recent
  queued.set(key, async () => {
    if (!needsFetch(cache.get(key), Date.now())) return;
    let entry: Entry;
    try {
      entry = { programmes: await loadProgrammes(playlist, channelId), fetchedAt: Date.now(), failed: false };
    } catch {
      entry = { programmes: cache.get(key)?.programmes ?? [], fetchedAt: Date.now(), failed: true };
    }
    cache.set(key, entry);
    notify(key);
  });
  pump();
}

/** Drops requests for rows that scrolled away before their turn. */
export function cancelEpgRequest(playlistId: number, channelId: string) {
  queued.delete(keyOf(playlistId, channelId));
}

/** Programmes of a channel (null while loading or when there is no guide). Loads on first use. */
export function useProgrammes(playlist: Playlist | null, channelId: string | null): Programme[] | null {
  const key = playlist && channelId ? keyOf(playlist.id, channelId) : '';
  const entry = useSyncExternalStore(
    (l) => {
      if (!key) return () => undefined;
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(l);
      return () => {
        set.delete(l);
        if (!set.size) listeners.delete(key);
      };
    },
    () => (key ? cache.get(key) : undefined),
  );
  // `entry` changes identity on refresh, which re-requests below only when the cache was dropped.
  useEffect(() => {
    if (!playlist || !channelId) return;
    request(playlist, channelId);
    return () => cancelEpgRequest(playlist.id, channelId);
  }, [playlist, channelId, entry]);
  const { epgOffsetHours } = usePrefs();
  return useMemo(
    () => (entry?.programmes.length ? shiftProgrammes(entry.programmes, epgOffsetHours) : null),
    [entry, epgOffsetHours],
  );
}

/** Current time, ticking every `everyMs` (progress bars, "now" switching to the next show). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function useNowNext(playlist: Playlist | null, channelId: string | null): NowNext | null {
  const programmes = useProgrammes(playlist, channelId);
  const now = useNow();
  return programmes ? nowNext(programmes, now) : null;
}
