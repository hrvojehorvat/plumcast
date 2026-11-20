/** A react-native-tvos remote event (Android TV / Fire TV): eventKeyAction 0 = key down, 1 = key up, -1 = no phase. */
export type TvKeyEvent = { eventType: string; eventKeyAction?: number };

/**
 * One press of the remote → one event type, or null to ignore this event.
 * Android sends only key-up events unless key-down events are switched on natively (we switch them on in
 * plugins/withTvKeyDown.js, so a press reacts at once). Until a key-down has been seen, key-ups are the presses;
 * after that, key-ups are ignored so a press never counts twice. Holding a direction repeats it (longUp → up, …).
 */
export function createTvPressFilter() {
  let sawKeyDown = false;
  return (event: TvKeyEvent): string | null => {
    if (event.eventKeyAction === 0) sawKeyDown = true;
    else if (event.eventKeyAction === 1 && sawKeyDown) return null;
    const type = event.eventType;
    return /^long(Up|Down|Left|Right)$/.test(type) ? type.slice(4).toLowerCase() : type;
  };
}
