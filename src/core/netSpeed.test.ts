import { describe, expect, it } from 'vitest';
import { averageBitrate, bitrateFromInfo, nextSpeed, sizeFromHeaders } from './netSpeed';

describe('remembered download speed', () => {
  it('takes the first report as it is', () => {
    expect(nextSpeed(null, 8_500_000)).toBe(8_500_000);
  });

  it('moves part of the way with each report', () => {
    expect(nextSpeed(8_000_000, 18_000_000)).toBe(11_000_000);
    expect(nextSpeed(8_000_000, 8_000_000)).toBe(8_000_000);
  });

  it('ignores glitches', () => {
    expect(nextSpeed(8_000_000, 0)).toBe(8_000_000);
    expect(nextSpeed(8_000_000, Number.NaN)).toBe(8_000_000);
    expect(nextSpeed(null, 10)).toBeNull();
  });
});

describe('bitrate from the provider info', () => {
  it('reads kbit/s', () => {
    expect(bitrateFromInfo(12241)).toBe(12_241_000);
  });

  it('drops missing or nonsense values', () => {
    expect(bitrateFromInfo(null)).toBeNull();
    expect(bitrateFromInfo(0)).toBeNull();
    expect(bitrateFromInfo(5_000_000)).toBeNull();
  });
});

describe('average bitrate from size and length', () => {
  it('matches what the provider lists', () => {
    // Rad na odredjeno vreme 4K: 7.68 GB, 5020 s → 12.2 Mb/s (provider: 12241 kbit/s).
    expect(averageBitrate(7_680_000_000, 5_020_000)).toBe(12_239_044);
    // Wolf Man 4K: 4.93 GB, 103 min → 6.4 Mb/s (provider: nothing).
    expect(Math.round(averageBitrate(4_930_000_000, 6_180_000)! / 100_000) / 10).toBe(6.4);
  });

  it('gives up without size or length, or on nonsense', () => {
    expect(averageBitrate(null, 6_000_000)).toBeNull();
    expect(averageBitrate(4_930_000_000, null)).toBeNull();
    expect(averageBitrate(4_930_000_000, 30_000)).toBeNull();
    expect(averageBitrate(100, 6_000_000)).toBeNull();
  });

  it('reads the file size from the headers', () => {
    expect(sizeFromHeaders(206, 'bytes 0-0/7680000000', '1')).toBe(7_680_000_000);
    expect(sizeFromHeaders(200, null, '4930000000')).toBe(4_930_000_000);
    expect(sizeFromHeaders(206, 'bytes 0-0/*', '1')).toBeNull();
    expect(sizeFromHeaders(404, null, '100')).toBeNull();
  });
});
