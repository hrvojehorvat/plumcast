import { useEffect } from 'react';
import type { CategorySection } from '../core/voiceWords';
import { useLatest } from './useQuery';

/**
 * Plum asks a screen to do something it otherwise only does from its own UI: select a category
 * (Live TV, Movies, Series) or fill in a search. Works whether the screen is already open or
 * opens now: the request waits until the screen takes it.
 */
type Target = CategorySection | 'search';
const pending: Partial<Record<Target, string>> = {};
const listeners = new Set<() => void>();

function request(target: Target, value: string) {
  pending[target] = value;
  listeners.forEach((l) => l());
}

function usePending(target: Target, apply: (value: string) => void) {
  const latest = useLatest(apply);
  useEffect(() => {
    const take = () => {
      const value = pending[target];
      if (value === undefined) return;
      delete pending[target];
      latest.current(value);
    };
    take();
    listeners.add(take);
    return () => {
      listeners.delete(take);
    };
  }, [target, latest]);
}

export const requestCategory = (section: CategorySection, id: string) => request(section, id);
/** A screen of `section`: selects a requested category with its own `select`. */
export const usePendingCategory = (section: CategorySection, select: (id: string) => void) => usePending(section, select);

export const requestSearch = (query: string) => request('search', query);
/** The Search screen: fills in a requested search. */
export const usePendingSearch = (setQuery: (query: string) => void) => usePending('search', setQuery);
