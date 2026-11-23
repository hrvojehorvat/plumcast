import { describe, expect, it } from 'vitest';
import { BUFFER_LEVELS, DEFAULT_BUFFER_LEVEL, fileBuffer, isBufferLevel } from './buffer';

describe('movie buffer levels', () => {
  it('defaults to Media3’s own buffer (the behaviour before the setting)', () => {
    expect(DEFAULT_BUFFER_LEVEL).toBe('small');
    expect(fileBuffer('small')).toEqual({ aheadMs: 50_000, startMs: 2_500, afterStallMs: 5_000 });
  });

  it('loads further ahead and waits longer after a stall on each level, starting just as fast', () => {
    const levels = BUFFER_LEVELS.map(fileBuffer);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].aheadMs).toBeGreaterThan(levels[i - 1].aheadMs);
      expect(levels[i].afterStallMs).toBeGreaterThan(levels[i - 1].afterStallMs);
      expect(levels[i].startMs).toBe(2_500);
    }
    // Never wait for more than can be loaded ahead.
    for (const l of levels) expect(l.afterStallMs).toBeLessThan(l.aheadMs);
  });

  it('accepts only known levels from storage', () => {
    expect(isBufferLevel('large')).toBe(true);
    expect(isBufferLevel('huge')).toBe(false);
    expect(isBufferLevel(undefined)).toBe(false);
  });
});
