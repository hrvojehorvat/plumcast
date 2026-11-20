import { useEffect, useMemo, useRef } from 'react';

/**
 * Coming into a column from outside (▶ from the menu, ◀ from the next column) lands on the column's
 * chosen item (the selected category, the channel you were on), not on whatever is first in it, such as
 * the search box above a list. Moving inside the column is untouched.
 *
 * Every focusable in the column calls `focus()` / `blur()`; the target passes `focus(true)`.
 * A blur marks the column as left a moment later, unless the focus lands in the same column first
 * (the library blurs and focuses in one go).
 */
export function useColumnEntry(toTarget: () => void) {
  const target = useRef(toTarget);
  useEffect(() => {
    target.current = toTarget;
  });
  const inside = useRef(false);
  const seq = useRef(0);
  return useMemo(
    () => ({
      focus(isTarget = false) {
        seq.current++;
        const entering = !inside.current;
        inside.current = true;
        if (entering && !isTarget) setTimeout(() => target.current(), 0);
      },
      blur() {
        const token = ++seq.current;
        queueMicrotask(() => {
          if (seq.current === token) inside.current = false;
        });
      },
    }),
    [],
  );
}
