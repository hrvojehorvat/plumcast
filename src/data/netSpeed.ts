import { nextSpeed } from '../core/netSpeed';
import { getSetting, setSetting } from './db';

/** Remembered download speed per playlist (bit/s), stored in the settings table (src/core/netSpeed.ts). */
const KEY = 'netSpeed';
const SAVE_AFTER_MS = 20_000;

let speeds: Record<string, number> | null = null;
let loading: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Promise<void> {
  loading ??= (async () => {
    try {
      const raw = await getSetting(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      const clean: Record<string, number> = {};
      if (parsed && typeof parsed === 'object') {
        for (const [id, v] of Object.entries(parsed)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) clean[id] = v;
      }
      speeds = { ...clean, ...speeds };
    } catch (error) {
      console.warn('Plumcast download speeds could not be read', error);
      speeds ??= {};
    }
  })();
  return loading;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void setSetting(KEY, JSON.stringify(speeds ?? {})).catch((error: unknown) => console.warn('Plumcast download speeds could not be saved', error));
  }, SAVE_AFTER_MS);
}

/** A speed report from the player (Media3's estimate) while a stream of this playlist loads. */
export function recordSpeed(playlistId: number, bps: number) {
  speeds ??= {};
  void load();
  const next = nextSpeed(speeds[playlistId] ?? null, bps);
  if (next === null || next === speeds[playlistId]) return;
  speeds[playlistId] = next;
  scheduleSave();
}

/** The remembered speed for this playlist, or null before anything was measured. */
export async function getSpeed(playlistId: number): Promise<number | null> {
  await load();
  return speeds?.[playlistId] ?? null;
}
