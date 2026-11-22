import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

/** Whether the Plum panel is open. One for the whole app: the menu, the mic button and long-press OK open it. */
let open = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (next: boolean) => {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
};

/** A sentence to use instead of listening (dev screenshots, see `__plumcastSay` below). */
let said: string | null = null;

export const plum = {
  open: () => set(true),
  close: () => set(false),
  /** Opens Plum as if `text` had been spoken. */
  say: (text: string) => {
    said = text;
    if (open) set(false);
    set(true);
  },
  /** The sentence given to `say`, once (then Plum listens as usual). */
  takeSaid: (): string | null => {
    const text = said;
    said = null;
    return text;
  },
};

/**
 * Browser dev builds only (screenshots for the project page, dev/screenshots.mjs): there is no
 * microphone in an automated browser, so `window.__plumcastSay("action movies")` stands in for
 * speech. Not in release builds (`__DEV__` is false) and never on Android (no `window` there).
 */
export const PLUM_DEV_SAY = __DEV__ && Platform.OS === 'web';
if (PLUM_DEV_SAY) (globalThis as { __plumcastSay?: (text: string) => void }).__plumcastSay = plum.say;

export function usePlumOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => open);
}
