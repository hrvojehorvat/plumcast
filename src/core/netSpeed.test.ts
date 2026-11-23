import { describe, expect, it } from 'vitest';
import { bitrateFromInfo, nextSpeed } from './netSpeed';

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
