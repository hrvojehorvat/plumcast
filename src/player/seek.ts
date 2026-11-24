import type { Programme } from '../core/epg';

const MINUTE = 60_000;

/** Seek step for repeated ◀/▶ presses: 1 min, then 5 min, then 10 min while the key keeps going. */
export function seekStep(presses: number): number {
  if (presses < 4) return MINUTE;
  if (presses < 8) return 5 * MINUTE;
  return 10 * MINUTE;
}

/**
 * Keeps a seek target inside the programme and before "now" (a running programme has no future),
 * on whole minutes (Xtream replay links start on a minute).
 */
export function clampSeek(target: number, programme: Pick<Programme, 'start' | 'end'>, now: number): number {
  const latest = Math.min(programme.end, now) - MINUTE;
  const clamped = Math.max(programme.start, Math.min(target, latest));
  return Math.max(programme.start, Math.floor(clamped / MINUTE) * MINUTE);
}

/**
 * ◀/▶ on live TV's progress line: the new rewind target, or null = back to live. ◀ always moves back
 * (the first press lands exactly a minute behind now); ▶ that reaches the last minute returns to live.
 */
export function liveSeek(target: number | null, direction: 1 | -1, step: number, programme: Pick<Programme, 'start' | 'end'>, now: number): number | null {
  const wanted = (target ?? now) + direction * step;
  if (direction === 1 && wanted >= now - MINUTE) return null;
  return clampSeek(wanted, programme, now);
}
