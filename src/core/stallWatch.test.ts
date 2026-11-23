import { describe, expect, it } from 'vitest';
import { createStallWatch } from './stallWatch';

const MB = 1_000_000;

describe('Auto buffer during a video', () => {
  it('moves up at the first stall when the connection is measurably too slow', () => {
    const watch = createStallWatch(() => 0);
    watch.speed(8.5 * MB);
    expect(watch.stall(12.2 * MB)).toBe(true);
  });

  it('waits for a second stall within 5 minutes when the connection should be fast enough', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    watch.speed(8.5 * MB);
    expect(watch.stall(5 * MB)).toBe(false);
    t += 4 * 60_000;
    expect(watch.stall(5 * MB)).toBe(true);
  });

  it('forgets a stall after 5 minutes', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    expect(watch.stall(null)).toBe(false);
    t += 6 * 60_000;
    expect(watch.stall(null)).toBe(false);
  });

  it('counts stalls without a bitrate or a measured speed', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    expect(watch.stall(12 * MB)).toBe(false);
    t += 30_000;
    expect(watch.stall(12 * MB)).toBe(true);
  });

  it('ignores loading right after a jump', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    watch.speed(5 * MB);
    watch.jumped();
    t += 1_000;
    expect(watch.stall(12 * MB)).toBe(false);
    t += 5_000;
    expect(watch.stall(12 * MB)).toBe(true);
  });

  it('starts fresh after moving up', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    expect(watch.stall(null)).toBe(false);
    watch.reset();
    t += 10_000;
    expect(watch.stall(null)).toBe(false);
  });
});
