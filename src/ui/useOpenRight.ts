import { useCallback, useEffect, useRef, useState } from 'react';
import { keyMark, openRight, setSectionEntry } from './lastKey';
import { useLatest } from './useQuery';

/**
 * OK on an item that fills the column to its right (a category): once that column's `content` has
 * loaded, the focus moves into it, as ▶ would. `content` is null / undefined while loading; an empty
 * list ends the wait without moving. Pressing another key meanwhile cancels the move (see openRight).
 * Returns the function to call from onSelect.
 */
export function useOpenRight(content: object | null | undefined) {
  const pending = useRef<number | null>(null);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    const mark = pending.current;
    if (mark === null || !content) return;
    pending.current = null;
    if (Array.isArray(content) && content.length === 0) return;
    openRight(mark);
  }, [request, content]);
  return useCallback(() => {
    pending.current = keyMark();
    setRequest((n) => n + 1);
  }, []);
}

/**
 * Registers how OK in the menu enters this section: `focusFirst` puts the focus on the first column's
 * selected item and returns false while that column isn't there yet.
 */
export function useSectionEntry(section: string, focusFirst: () => boolean) {
  const latest = useLatest(focusFirst);
  useEffect(() => {
    setSectionEntry(section, () => latest.current());
    return () => setSectionEntry(section, null);
  }, [section, latest]);
}
