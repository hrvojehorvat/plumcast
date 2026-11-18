import { useSyncExternalStore } from 'react';
import { toPlaylistError, type PlaylistError } from '../core/errors';
import { isStale } from '../core/playlistForm';
import type { PlaylistDraft } from '../core/models';
import * as db from './playlists';
import type { Playlist } from './playlists';
import { draftSource, fetchCatalog, savedSource, type SyncProgress } from './sync';

/** App-wide playlist state. Screens read it with `usePlaylists()` and change it with `playlists.*`. */
export interface PlaylistState {
  ready: boolean;
  /** Set when the database couldn't be opened. */
  storageError: string | null;
  list: Playlist[];
  activeId: number | null;
  /** The running download. Only one at a time. `playlistId` is null while adding a new playlist. */
  syncing: { playlistId: number | null; progress: SyncProgress | null } | null;
  /** Last failed background refresh (add / edit failures go to the form instead). */
  syncError: { playlistId: number; error: PlaylistError } | null;
}

let state: PlaylistState = { ready: false, storageError: null, list: [], activeId: null, syncing: null, syncError: null };
const listeners = new Set<() => void>();
let controller: AbortController | null = null;
let running: Promise<unknown> | null = null;

function set(patch: Partial<PlaylistState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePlaylists(): PlaylistState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function activePlaylist(s: PlaylistState = state): Playlist | null {
  return s.list.find((p) => p.id === s.activeId) ?? null;
}

async function reload() {
  const list = await db.listPlaylists();
  let activeId = await db.getActiveId();
  if (!list.some((p) => p.id === activeId)) {
    activeId = list[0]?.id ?? null;
    await db.setActiveId(activeId);
  }
  set({ list, activeId });
}

/** Runs one download at a time with progress and cancel. A new one stops the running one first. */
async function withSync<T>(playlistId: number | null, work: (signal: AbortSignal, onProgress: (p: SyncProgress) => void) => Promise<T>): Promise<T> {
  while (running) {
    controller?.abort();
    await running.catch(() => undefined);
  }
  const own = new AbortController();
  controller = own;
  set({ syncing: { playlistId, progress: null } });
  const task = work(own.signal, (progress) => {
    if (!own.signal.aborted) set({ syncing: { playlistId, progress } });
  });
  running = task;
  try {
    return await task;
  } catch (error) {
    throw toPlaylistError(error);
  } finally {
    running = null;
    controller = null;
    set({ syncing: null });
  }
}

let initStarted = false;

export const playlists = {
  /** Opens storage and loads playlists; refreshes the active one in the background if it is a day old. */
  async init() {
    if (initStarted) return;
    initStarted = true;
    try {
      await reload();
      set({ ready: true });
    } catch (error) {
      set({ ready: true, storageError: error instanceof Error ? error.message : String(error) });
      return;
    }
    const active = activePlaylist();
    if (active && isStale(active)) void playlists.refresh(active.id);
  },

  /** Downloads first, then stores: a failed download leaves nothing behind. The new playlist becomes active. */
  async add(draft: PlaylistDraft, fileText: string | null): Promise<number> {
    const catalog = await withSync(null, async (signal, onProgress) => fetchCatalog(await draftSource(draft, fileText, null), { signal, onProgress }));
    const id = await db.createPlaylist(draft, catalog);
    await db.setActiveId(id);
    await reload();
    return id;
  },

  /** Saves edits; re-downloads first when the source changed, so a wrong new login changes nothing. */
  async update(id: number, draft: PlaylistDraft, fileText: string | null, needsSync: boolean) {
    const saved = state.list.find((p) => p.id === id) ?? null;
    const catalog = needsSync
      ? await withSync(id, async (signal, onProgress) => fetchCatalog(await draftSource(draft, fileText, saved), { signal, onProgress }))
      : null;
    await db.updatePlaylist(id, draft, catalog);
    if (state.syncError?.playlistId === id && catalog) set({ syncError: null });
    await reload();
  },

  async remove(id: number) {
    if (state.syncing?.playlistId === id) playlists.cancelSync();
    await db.deletePlaylist(id);
    if (state.syncError?.playlistId === id) set({ syncError: null });
    await reload();
  },

  async setActive(id: number) {
    await db.setActiveId(id);
    set({ activeId: id });
  },

  /** Re-downloads a saved playlist. Errors are kept in `syncError` for the Home screen. */
  async refresh(id: number) {
    const playlist = state.list.find((p) => p.id === id);
    if (!playlist || state.syncing?.playlistId === id) return;
    set({ syncError: null });
    try {
      await withSync(id, async (signal, onProgress) => {
        const catalog = await fetchCatalog(await savedSource(playlist), { signal, onProgress });
        await db.saveCatalog(id, catalog);
      });
      await reload();
    } catch (error) {
      const e = toPlaylistError(error);
      if (e.code !== 'cancelled') set({ syncError: { playlistId: id, error: e } });
    }
  },

  cancelSync() {
    controller?.abort();
  },
};
