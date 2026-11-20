import { useEffect, useRef } from 'react';
import { useLatest } from './useQuery';

/** How long the remote focus rests on an item before it opens (passing over items doesn't load each one). */
export const FOCUS_SELECT_MS = 300;

/**
 * Left-hand lists (menu, categories): moving the focus onto an item opens it after a short
 * pause, no OK needed. Leaving the item before that (e.g. ▶ right away) cancels it, so the
 * page you move into is never swapped out underneath you. Returns the item's focus handlers.
 */
export function useFocusSelect<T>(selected: T | null, select: (value: T) => void, delayMs = FOCUS_SELECT_MS) {
  const pending = useRef<{ value: T; timer: ReturnType<typeof setTimeout> } | null>(null);
  const latest = useLatest({ selected, select });
  const cancel = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onFocus: (value: T) => {
      cancel();
      if (value === latest.current.selected) return;
      const timer = setTimeout(() => {
        pending.current = null;
        latest.current.select(value);
      }, delayMs);
      pending.current = { value, timer };
    },
    // Only this item's own pending open; the next item may already have started its own
    // (the library can report the new focus before the old blur).
    onBlur: (value: T) => {
      if (pending.current?.value === value) cancel();
    },
  };
}
