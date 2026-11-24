import { describe, expect, it } from 'vitest';
import { clampSeek, liveSeek, seekStep } from './seek';

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

describe('liveSeek', () => {
  const MIN = 60_000;
  const now = 100 * MIN + 30_000;
  const show = { start: 60 * MIN, end: 160 * MIN };

  it('moves back from live on the first ◀', () => {
    expect(liveSeek(null, -1, MIN, show, now)).toBe(99 * MIN);
    expect(liveSeek(99 * MIN, -1, 5 * MIN, show, now)).toBe(94 * MIN);
  });

  it('stops at the start of the programme', () => {
    expect(liveSeek(62 * MIN, -1, 10 * MIN, show, now)).toBe(60 * MIN);
  });

  it('goes forward, and back to live at the last minute', () => {
    expect(liveSeek(90 * MIN, 1, 5 * MIN, show, now)).toBe(95 * MIN);
    expect(liveSeek(99 * MIN, 1, MIN, show, now)).toBeNull();
    expect(liveSeek(null, 1, MIN, show, now)).toBeNull();
  });
});
