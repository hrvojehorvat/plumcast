import type { Programme } from './epg';

/** The guide grid works in 5-minute slots: focus moves up/down to the programme at the same slot. */
export const SLOT_MS = 5 * 60_000;

/** Local midnight of the day that contains `ms`. */
export function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local midnight `days` days after the day of `ms` (DST days are 23 or 25 hours long). */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/** Days (local midnights) from the first to the last day that has programmes, kept within `maxBack`/`maxAhead` of today. */
export function guideDays(first: number | null, last: number | null, now = Date.now(), maxBack = 7, maxAhead = 7): number[] {
  const today = dayStart(now);
  if (first === null || last === null) return [today];
  const from = Math.max(dayStart(first), addDays(today, -maxBack));
  const to = Math.min(dayStart(last), addDays(today, maxAhead));
  const days: number[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  if (!days.includes(today)) {
    days.push(today);
    days.sort((a, b) => a - b);
  }
  return days;
}

export interface GuideCell {
  /** Clipped to the day. */
  start: number;
  end: number;
  /** Null for an empty stretch without programme information. */
  programme: Programme | null;
  /** First and last 5-minute slot (1-based; slot 0 is the channel name). */
  slots: [number, number];
  /** An empty stretch is cut into half hours; true for every piece after the first. */
  more?: true;
}

/** Empty stretches are cut into pieces this long, so moving up/down through them keeps the time. */
export const GAP_PIECE_MS = 30 * 60_000;

/**
 * One channel's row for one day: programmes clipped to the day, gaps filled with empty cells,
 * so every slot of the day belongs to exactly one cell (remote focus needs that). Gaps come in
 * half-hour pieces.
 */
export function layoutRow(programmes: readonly Programme[], from: number, to: number): GuideCell[] {
  const cells: GuideCell[] = [];
  const slot = (ms: number) => Math.round((ms - from) / SLOT_MS);
  let cursor = from;
  let lastSlot = 0;
  const push = (start: number, end: number, programme: Programme | null) => {
    const lo = Math.max(lastSlot + 1, slot(start) + 1);
    const hi = Math.max(lo, slot(end));
    cells.push({ start, end, programme, slots: [lo, hi] });
    lastSlot = hi;
  };
  const gap = (start: number, end: number) => {
    let first = true;
    while (start < end) {
      const next = Math.min(end, from + (Math.floor((start - from) / GAP_PIECE_MS) + 1) * GAP_PIECE_MS);
      push(start, next, null);
      if (!first) cells[cells.length - 1].more = true;
      first = false;
      start = next;
    }
  };
  for (const p of programmes) {
    const start = Math.max(p.start, cursor);
    const end = Math.min(p.end, to);
    if (end <= start) continue;
    if (start > cursor) gap(cursor, start);
    push(start, end, p);
    cursor = end;
  }
  if (cursor < to) gap(cursor, to);
  return cells;
}

/** Applies the user's guide time correction (whole hours). */
export function shiftProgrammes(programmes: readonly Programme[], offsetHours: number): Programme[] {
  if (!offsetHours) return programmes as Programme[];
  const ms = offsetHours * 3_600_000;
  return programmes.map((p) => ({ ...p, start: p.start + ms, end: p.end + ms }));
}
