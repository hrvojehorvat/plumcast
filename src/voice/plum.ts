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

export const plum = {
  open: () => set(true),
  close: () => set(false),
};

export function usePlumOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => open);
}
