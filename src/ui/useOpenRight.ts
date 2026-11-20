import { useCallback, useEffect, useRef, useState } from 'react';
import { keyMark, moveRightUnlessMoved } from './lastKey';

/**
 * OK on an item that fills the column to its right (a category): once that column's `content` has
 * loaded, the focus moves into it, as ▶ would. `content` is null / undefined while loading; an empty
 * list ends the wait without moving. Pressing another key meanwhile cancels the move.
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
    // After the column's items have registered with the navigation.
    const id = setTimeout(() => moveRightUnlessMoved(mark), 0);
    return () => clearTimeout(id);
  }, [request, content]);
  return useCallback(() => {
    pending.current = keyMark();
    setRequest((n) => n + 1);
  }, []);
}
