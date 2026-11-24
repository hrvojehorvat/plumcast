import { describe, expect, it } from 'vitest';
import { clampSeek, seekStep } from './seek';

const M = 60_000;
const programme = { start: 100 * M, end: 160 * M };

describe('replay seeking', () => {
  it('speeds up while the key keeps being pressed', () => {
    expect([0, 3, 4, 7, 8, 20].map((n) => seekStep(n) / M)).toEqual([1, 1, 5, 5, 10, 10]);
  });

  it('stays inside the programme, on whole minutes', () => {
    expect(clampSeek(90 * M, programme, 999 * M)).toBe(100 * M);
    expect(clampSeek(130.5 * M, programme, 999 * M)).toBe(130 * M);
    expect(clampSeek(200 * M, programme, 999 * M)).toBe(159 * M);
  });

  it('never goes past now for a programme that is still on', () => {
    expect(clampSeek(150 * M, programme, 120 * M)).toBe(119 * M);
    expect(clampSeek(150 * M, programme, 100.5 * M)).toBe(100 * M);
  });
});
