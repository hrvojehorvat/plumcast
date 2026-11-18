import { useEffect, useState, useSyncExternalStore } from 'react';
import { nowNext, parseShortEpg, type NowNext, type Programme } from '../core/epg';
import { getJson } from '../core/http';
import { apiUrl } from '../core/xtream';
import { appFetch } from './net';
import type { Playlist } from './playlists';
import { loginFor } from './session';

/**
 * Now/next for channel rows, from Xtream's `get_short_epg`. Fetched lazily for rows that are
 * on screen, at most a few requests at a time, newest request first (the rows the user is
 * looking at now). M3U playlists get their guide from XMLTV in the TV guide phase.
 */
interface Entry {
  programmes: Programme[];
  fetchedAt: number;
  failed: boolean;
}

const MAX_PARALLEL = 4;
const FRESH_MS = 2 * 60 * 60_000;
const RETRY_FAILED_MS = 10 * 60_000;

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
  if (entry.failed) return now - entry.fetchedAt > RETRY_FAILED_MS;
  if (now - entry.fetchedAt > FRESH_MS) return true;
  // Ran out of programmes (the short EPG only covers a few hours).
  const last = entry.programmes[entry.programmes.length - 1];
  return !last || last.end < now;
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

function request(playlist: Playlist, channelId: string) {
  const key = keyOf(playlist.id, channelId);
  if (playlist.kind !== 'xtream' || !needsFetch(cache.get(key), Date.now())) return;
  queued.delete(key); // re-insert at the end = most recent
  queued.set(key, async () => {
    if (!needsFetch(cache.get(key), Date.now())) return;
    let entry: Entry;
    try {
      const login = await loginFor(playlist);
      if (!login) throw new Error('no login');
      const json = await getJson(appFetch, apiUrl(login, 'get_short_epg', { stream_id: channelId, limit: 8 }), { timeoutMs: 15_000 });
      entry = { programmes: parseShortEpg(json), fetchedAt: Date.now(), failed: false };
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
  useEffect(() => {
    if (!playlist || !channelId) return;
    request(playlist, channelId);
    return () => cancelEpgRequest(playlist.id, channelId);
  }, [playlist, channelId]);
  return entry?.programmes.length ? entry.programmes : null;
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
