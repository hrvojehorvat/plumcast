import { useSyncExternalStore } from 'react';
import { rememberSearch } from '../core/search';
import { getSetting, setSetting } from './db';

/** Recent full searches (this device only), newest first. */
const KEY = 'searches';
let list: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (next: string[]) => {
  list = next;
  listeners.forEach((l) => l());
};

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await getSetting(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) set(parsed.filter((q): q is string => typeof q === 'string'));
  } catch (e) {
    console.warn('Recent searches could not be read', e);
  }
}

export function useRecentSearches(): string[] {
  void load();
  return useSyncExternalStore(subscribe, () => list, () => list);
}

async function save(next: string[]) {
  set(next);
  try {
    await setSetting(KEY, next.length ? JSON.stringify(next) : null);
  } catch (e) {
    console.warn('Recent searches could not be saved', e);
  }
}

export const recentSearches = {
  add: (query: string) => save(rememberSearch(list, query)),
  clear: () => save([]),
};
