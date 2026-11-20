import { useSyncExternalStore } from 'react';
import { LANGS, type Lang } from '../core/i18n';
import type { StreamFormat } from '../core/streams';
import { getSetting, setSetting } from './db';

/** App-wide preferences, stored in the settings table and kept in memory. */
export interface Prefs {
  /** Moves all guide times by whole hours (for providers whose guide is in the wrong time zone). */
  epgOffsetHours: number;
  /** 24-hour clock ("20:15") or 12-hour ("8:15 PM"). */
  clock24: boolean;
  /** UI language; null = follow the device. */
  lang: Lang | null;
  /** Xtream live channels as MPEG-TS (`.ts`, default) or HLS (`.m3u8`). */
  streamFormat: StreamFormat;
}

export const EPG_OFFSET_LIMIT = 12;
const DEFAULTS: Prefs = { epgOffsetHours: 0, clock24: true, lang: null, streamFormat: 'ts' };
const KEY = 'prefs';

let prefs: Prefs = DEFAULTS;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => prefs, () => prefs);
}

export function getPrefs(): Prefs {
  return prefs;
}

/** Loads saved preferences; the defaults stay if storage can't be read. */
export async function loadPrefs() {
  try {
    const raw = await getSetting(KEY);
    if (raw) prefs = sanitize({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) });
    listeners.forEach((l) => l());
  } catch (error) {
    console.warn('Plumcast preferences could not be read', error);
  }
}

export async function setPrefs(patch: Partial<Prefs>) {
  prefs = sanitize({ ...prefs, ...patch });
  listeners.forEach((l) => l());
  try {
    await setSetting(KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn('Plumcast preferences could not be saved', error);
  }
}

function sanitize(p: Prefs): Prefs {
  const offset = Math.round(Number(p.epgOffsetHours) || 0);
  return {
    epgOffsetHours: Math.max(-EPG_OFFSET_LIMIT, Math.min(EPG_OFFSET_LIMIT, offset)),
    clock24: p.clock24 !== false,
    lang: p.lang && LANGS.includes(p.lang) ? p.lang : null,
    streamFormat: p.streamFormat === 'm3u8' ? 'm3u8' : 'ts',
  };
}
