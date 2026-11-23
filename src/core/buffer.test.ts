import { describe, expect, it } from 'vitest';
import { autoLevel, BUFFER_LEVELS, DEFAULT_BUFFER_CHOICE, fileBuffer, HEAD_START_MS, isBufferChoice, maxLevelForRam, needsHeadStart, resolveLevel } from './buffer';

const GB = 1024 ** 3;
const MB = 1_000_000;

describe('movie buffer levels', () => {
  it('defaults to Auto; Small is Media3’s own buffer (the behaviour before the setting)', () => {
    expect(DEFAULT_BUFFER_CHOICE).toBe('auto');
    expect(fileBuffer('small')).toEqual({ aheadMs: 50_000, startMs: 2_500, afterStallMs: 5_000 });
  });

  it('loads further ahead and waits longer after a stall on each level, starting just as fast', () => {
    const levels = BUFFER_LEVELS.map(fileBuffer);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].aheadMs).toBeGreaterThan(levels[i - 1].aheadMs);
      expect(levels[i].afterStallMs).toBeGreaterThan(levels[i - 1].afterStallMs);
      expect(levels[i].startMs).toBe(2_500);
    }
    for (const l of levels) expect(l.afterStallMs).toBeLessThan(l.aheadMs);
  });

  it('accepts only known choices from storage', () => {
    expect(isBufferChoice('auto')).toBe(true);
    expect(isBufferChoice('large')).toBe(true);
    expect(isBufferChoice('huge')).toBe(false);
    expect(isBufferChoice(undefined)).toBe(false);
  });
});

describe('Auto buffer', () => {
  it('picks the lowest level that is probably enough', () => {
    // HD film (5 Mb/s) on an 8.5 Mb/s connection: clearly faster.
    expect(autoLevel(8.5 * MB, 5 * MB, 4 * GB)).toBe('small');
    expect(autoLevel(8.5 * MB, 6.5 * MB, 4 * GB)).toBe('medium');
    expect(autoLevel(8.5 * MB, 9 * MB, 4 * GB)).toBe('large');
    // The 4K film (12.2 Mb/s average) on 8.5 Mb/s.
    expect(autoLevel(8.5 * MB, 12.2 * MB, 4 * GB)).toBe('max');
  });

  it('starts low when it can’t compare', () => {
    expect(autoLevel(null, 12 * MB, 4 * GB)).toBe('small');
    expect(autoLevel(8 * MB, null, 4 * GB)).toBe('small');
  });

  it('never goes above what the RAM allows', () => {
    expect(maxLevelForRam(1 * GB)).toBe('medium');
    expect(maxLevelForRam(2 * GB)).toBe('large');
    expect(maxLevelForRam(4 * GB)).toBe('max');
    expect(maxLevelForRam(null)).toBe('large');
    expect(autoLevel(8.5 * MB, 12.2 * MB, 1 * GB)).toBe('medium');
    expect(autoLevel(8.5 * MB, 12.2 * MB, null)).toBe('large');
  });

  it('uses a fixed level from Settings as it is', () => {
    expect(resolveLevel('small', 1 * MB, 20 * MB, 4 * GB)).toBe('small');
    expect(resolveLevel('max', null, null, 1 * GB)).toBe('max');
    expect(resolveLevel('auto', 8.5 * MB, 5 * MB, 4 * GB)).toBe('small');
  });
});

describe('head start when continuing', () => {
  it('waits for more video when continuing on a tight or slow connection', () => {
    expect(needsHeadStart(true, 9.3 * MB, 12.2 * MB)).toBe(true);
    expect(needsHeadStart(true, 9.3 * MB, 9 * MB)).toBe(true);
    expect(HEAD_START_MS).toBeLessThan(fileBuffer('small').aheadMs);
  });

  it('starts at once from the beginning, on a fast enough connection, or without numbers', () => {
    expect(needsHeadStart(false, 9.3 * MB, 12.2 * MB)).toBe(false);
    expect(needsHeadStart(true, 9.3 * MB, 6.4 * MB)).toBe(false);
    expect(needsHeadStart(true, null, 12.2 * MB)).toBe(false);
    expect(needsHeadStart(true, 9.3 * MB, null)).toBe(false);
  });
});
