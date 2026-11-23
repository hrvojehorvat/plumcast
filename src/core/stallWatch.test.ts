import { describe, expect, it } from 'vitest';
import { createStallWatch } from './stallWatch';

describe('Auto buffer during a video', () => {
  it('moves up at the second stall within 5 minutes', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    watch.started();
    t += 30_000;
    expect(watch.stall()).toBe(false);
    t += 4 * 60_000;
    expect(watch.stall()).toBe(true);
  });

  it('forgets a stall after 5 minutes', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    expect(watch.stall()).toBe(false);
    t += 6 * 60_000;
    expect(watch.stall()).toBe(false);
  });

  it('ignores stalls in the first 10 s after the picture (re)starts', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    watch.started();
    t += 8_000;
    expect(watch.stall()).toBe(false);
    t += 1_000;
    expect(watch.stall()).toBe(false);
    t += 20_000;
    expect(watch.stall()).toBe(false);
    t += 15_000;
    expect(watch.stall()).toBe(true);
  });

  it('gives a new level a fresh start: two more stalls, none right after the restart', () => {
    let t = 0;
    const watch = createStallWatch(() => t);
    watch.started();
    t += 20_000;
    watch.stall();
    t += 20_000;
    expect(watch.stall()).toBe(true);
    // Moved up: the stream restarts here.
    watch.reset();
    watch.started();
    t += 8_000;
    expect(watch.stall()).toBe(false);
    t += 30_000;
    expect(watch.stall()).toBe(false);
    t += 30_000;
    expect(watch.stall()).toBe(true);
  });
});
