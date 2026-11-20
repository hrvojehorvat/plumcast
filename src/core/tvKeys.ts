/** A react-native-tvos remote event (Android TV / Fire TV): eventKeyAction 0 = key down, 1 = key up, -1 = no phase. */
export type TvKeyEvent = { eventType: string; eventKeyAction?: number };

/** The same key again within this many ms is the remote repeating itself, not a new press. */
export const DUPLICATE_MS = 120;

/**
 * One press of the remote → one event type, or null to ignore this event.
 * Android sends only key-up events unless key-down events are switched on natively (plugins/withTvRemote.js
 * does, so a press reacts at once). Until a key-down has been seen, key-ups are the presses; after that,
 * key-ups are ignored so a press never counts twice. Holding a direction repeats it (longUp → up, …).
 * Some remotes send one press twice in a row; the same key within DUPLICATE_MS counts once (a move
 * must never skip a column).
 *
 * One filter for the whole app (see src/ui/remoteKeys.ts): a listener that starts mid-press (a dialog opened
 * by OK) must not take that press's key-up for a new press.
 */
export function createTvPressFilter(now: () => number = Date.now) {
  let sawKeyDown = false;
  let last: { type: string; at: number } | null = null;
  return (event: TvKeyEvent): string | null => {
    if (event.eventKeyAction === 0) sawKeyDown = true;
    else if (event.eventKeyAction === 1 && sawKeyDown) return null;
    const raw = event.eventType;
    const type = /^long(Up|Down|Left|Right)$/.test(raw) ? raw.slice(4).toLowerCase() : raw;
    if (event.eventKeyAction === 0 || event.eventKeyAction === 1) {
      const at = now();
      if (last && last.type === type && at - last.at < DUPLICATE_MS) return null;
      last = { type, at };
    }
    return type;
  };
}
