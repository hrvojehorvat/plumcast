import { Directions } from 'react-tv-space-navigation';

/**
 * The last remote key that moved the focus. Lets a column tell how the focus came in:
 * sideways (◀ ▶ from the menu or the next column) or from within (▲ ▼).
 */
let last: Directions | null = null;
/** Counts the user's remote keys, so a delayed move can tell whether the user pressed something since. */
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

/** Moves the focus one column right, as ▶ would, unless the user pressed a key after `mark`. */
export function moveRightUnlessMoved(mark: number) {
  if (presses !== mark || !send) return;
  last = Directions.RIGHT;
  send(Directions.RIGHT);
}

// ---------------------------------------------------------------- Back

/** Where Back takes the focus from the focused item: the column on its left (null: the menu, Back works as usual). */
let backStep: (() => void) | null = null;
let toMenu: (() => void) | null = null;

/** Set by the menu: puts the focus on the current section. */
export function setMenuFocus(focus: (() => void) | null) {
  toMenu = focus;
}

/** Every focusable item calls this on focus (before its own onFocus): Back goes to the menu… */
export function resetBackStep() {
  backStep = toMenu;
}

/** …unless the item's column says otherwise (call from onFocus): the column on its left. `null`: Back works as usual. */
export function setBackStep(step: (() => void) | null) {
  backStep = step;
}

/** Back on a main section: moves the focus one column left. False when the focus is already in the menu. */
export function stepBack(): boolean {
  if (!backStep) return false;
  const step = backStep;
  last = Directions.LEFT;
  step();
  return true;
}
