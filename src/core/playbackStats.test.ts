import { describe, expect, it } from 'vitest';
import { codecName, EMPTY_STATS, mbps, statsLines } from './playbackStats';

describe('playback stats', () => {
  it('names common codecs', () => {
    expect(codecName('hvc1.2.4.L153.B0')).toBe('HEVC');
    expect(codecName('avc1.640028')).toBe('H.264');
    expect(codecName('')).toBe('');
    expect(codecName('mp4v.20.9')).toBe('mp4v');
  });

  it('shows megabits, or a dash when unknown', () => {
    expect(mbps(32_400_000)).toBe('32.4 Mb/s');
    expect(mbps(0)).toBe('–');
  });

  it('builds the three lines', () => {
    expect(statsLines({ width: 3840, height: 2160, codec: 'hvc1.2.4', streamBps: 0, networkBps: 45_000_000, bufferedS: 12.34, stalls: 3 })).toEqual([
      '3840×2160 · HEVC',
      'Net 45.0 Mb/s · Stream –',
      'Buffer 12.3 s · Stalls 3',
    ]);
    expect(statsLines(EMPTY_STATS)[0]).toBe('–');
  });


  it('shows no buffer for live streams (no length, so the reported value is nonsense)', () => {
    expect(statsLines({ ...EMPTY_STATS, bufferedS: 9e14 })[2]).toBe('Buffer – · Stalls 0');
    expect(statsLines({ ...EMPTY_STATS, bufferedS: -3 })[2]).toBe('Buffer – · Stalls 0');
  });
});
