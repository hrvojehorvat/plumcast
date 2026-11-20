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

/** Counts focus changes (every focusable item reports its focus through resetBackStep). */
let focusMoves = 0;

/** A mark to pass to openRight later. */
export function keyMark() {
  return presses;
}

/**
 * After OK: moves the focus into the column on the right, as ▶ would. Tries again every 100 ms until
 * the focus has moved (on a TV the column's items can take a moment to register, and a ▶ before that
 * goes nowhere), for up to 4 s. Stops when the user pressed a key after `mark`.
 * `entry`, when given, decides each try: 'done' (it put the focus in place itself), 'wait' (not there
 * yet) or 'right' (send ▶).
 */
export function openRight(mark: number, entry: () => 'done' | 'wait' | 'right' = () => 'right') {
  const start = focusMoves;
  let tries = 0;
  const step = () => {
    if (presses !== mark || focusMoves !== start || tries++ > 40) return;
    const next = entry();
    if (next === 'done') return;
    if (next === 'right' && send) {
      last = Directions.RIGHT;
      send(Directions.RIGHT);
    }
    setTimeout(step, 100);
  };
  setTimeout(step, 0);
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
  focusMoves += 1;
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

// ---------------------------------------------------------------- Entering a section from the menu

/**
 * Pages with columns register how to put the focus on their first column (the selected category);
 * it returns false while that column isn't there yet. OK in the menu waits for it instead of ▶,
 * which would skip a column that is still loading.
 */
const entries = new Map<string, () => boolean>();

export function setSectionEntry(section: string, entry: (() => boolean) | null) {
  if (entry) entries.set(section, entry);
  else entries.delete(section);
}

export function sectionEntry(section: string) {
  return entries.get(section);
}
