import { formatTime } from '../core/format';
import { usePrefs } from '../data/prefs';

/** Formats clock times with the user's 12/24-hour choice. */
export function useTimeFormat(): (ms: number) => string {
  const { clock24 } = usePrefs();
  return (ms) => formatTime(ms, clock24);
}
