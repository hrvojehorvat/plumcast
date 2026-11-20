import { Directions } from 'react-tv-space-navigation';

/**
 * The last remote key that moved the focus. Lets a column tell how the focus came in:
 * sideways (◀ ▶ from the menu or the next column) or from within (▲ ▼).
 */
let last: Directions | null = null;
/** Counts remote keys, so a delayed move can tell whether the user pressed something since. */
let presses = 0;
/** The navigation library's key handler (set by configureRemote). */
let send: ((direction: Directions) => void) | null = null;

export function noteKey(direction: Directions) {
  last = direction;
  presses += 1;
}

/** Called by configureRemote with the handler the remote keys go to. */
export function setKeyHandler(handler: (direction: Directions) => void) {
  send = handler;
}

/**
 * Call from an item's onFocus: when the focus came in sideways, move it on to `target` (the selected
 * category, the channel you were on) instead of staying on whatever is first in the column.
 */
export function whenEnteredSideways(target: () => void) {
  if (last === Directions.LEFT || last === Directions.RIGHT) setTimeout(target, 0);
}

/** A mark to pass to moveRightUnlessMoved later. */
export function keyMark() {
  return presses;
}

/** Moves the focus one column right, as ▶ would, unless a key was pressed after `mark`. */
export function moveRightUnlessMoved(mark: number) {
  if (presses !== mark || !send) return;
  noteKey(Directions.RIGHT);
  send(Directions.RIGHT);
}
