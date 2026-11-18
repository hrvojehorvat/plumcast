import { describe, expect, it } from 'vitest';
import { addDays, dayStart, guideDays, layoutRow, shiftProgrammes } from './guide';

const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m).getTime();
const prog = (start: number, end: number, title = 'P') => ({ start, end, title, description: null });

describe('days', () => {
  it('finds local midnight and steps whole days', () => {
    expect(dayStart(at(20, 15))).toBe(at(0));
    expect(addDays(at(0), 1)).toBe(new Date(2026, 10, 19).getTime());
  });

  it('lists days with data around today, capped', () => {
    const now = at(12);
    expect(guideDays(null, null, now)).toEqual([at(0)]);
    const days = guideDays(addDays(now, -20), addDays(now, 2), now);
    expect(days).toHaveLength(10);
    expect(days[0]).toBe(addDays(at(0), -7));
    expect(days[9]).toBe(addDays(at(0), 2));
    // Data only in the past still shows today.
    expect(guideDays(addDays(now, -3), addDays(now, -2), now).at(-1)).toBe(at(0));
  });
});

describe('layoutRow', () => {
  const from = at(0);
  const to = addDays(from, 1);

  it('fills gaps and clips to the day', () => {
    const cells = layoutRow([prog(at(-1), at(1)), prog(at(2), at(3)), prog(at(4), at(25))], from, to);
    expect(cells.map((c) => [c.programme ? 'P' : c.more ? '+' : '-', c.slots])).toEqual([
      ['P', [1, 12]],
      ['-', [13, 18]],
      ['+', [19, 24]],
      ['P', [25, 36]],
      ['-', [37, 42]],
      ['+', [43, 48]],
      ['P', [49, 288]],
    ]);
    expect(cells[0].start).toBe(from);
    expect(cells.at(-1)!.end).toBe(to);
  });

  it('cuts empty stretches into half hours', () => {
    const cells = layoutRow([], from, to);
    expect(cells).toHaveLength(48);
    expect(cells[0]).toEqual({ start: from, end: at(0, 30), programme: null, slots: [1, 6] });
    expect(cells[1].more).toBe(true);
    expect(cells.at(-1)).toMatchObject({ end: to, slots: [283, 288] });
    // An odd start ends its first piece on the next half hour.
    const odd = layoutRow([prog(from, at(0, 10))], from, to);
    expect(odd[1]).toMatchObject({ start: at(0, 10), end: at(0, 30), slots: [3, 6] });
  });

  it('keeps slots increasing for very short or overlapping programmes', () => {
    const cells = layoutRow([prog(at(1), at(1, 1)), prog(at(1, 1), at(1, 2)), prog(at(1), at(2)), prog(at(1, 30), at(3))], from, to);
    const slots = cells.map((c) => c.slots);
    for (let i = 1; i < slots.length; i++) expect(slots[i][0]).toBe(slots[i - 1][1] + 1);
    expect(cells.find((c) => c.start === at(1, 2))?.programme?.start).toBe(at(1));
  });
});

describe('shiftProgrammes', () => {
  it('moves times by whole hours', () => {
    expect(shiftProgrammes([prog(at(1), at(2))], -1)).toEqual([prog(at(0), at(1))]);
  });
});
