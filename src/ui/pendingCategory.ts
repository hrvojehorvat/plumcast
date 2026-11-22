import { useEffect } from 'react';
import type { CategorySection } from '../core/voiceWords';
import { useLatest } from './useQuery';

/**
 * "Open this category": Plum asks, the Live TV / Movies / Series screen does it, whether it is
 * already open or opens now. Those screens otherwise keep their category to themselves.
 */
const pending: Partial<Record<CategorySection, string>> = {};
const listeners = new Set<() => void>();

export function requestCategory(section: CategorySection, id: string) {
  pending[section] = id;
  listeners.forEach((l) => l());
}

/** A screen of `section`: selects a requested category (once) with its own `select`. */
export function usePendingCategory(section: CategorySection, select: (id: string) => void) {
  const latest = useLatest(select);
  useEffect(() => {
    const apply = () => {
      const id = pending[section];
      if (id === undefined) return;
      delete pending[section];
      latest.current(id);
    };
    apply();
    listeners.add(apply);
    return () => {
      listeners.delete(apply);
    };
  }, [section, latest]);
}
