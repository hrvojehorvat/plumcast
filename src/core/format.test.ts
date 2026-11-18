import { describe, expect, it } from 'vitest';
import { ago, formatDate, formatNumber } from './format';

describe('format', () => {
  it('ago picks the right unit', () => {
    const now = 1_000_000_000_000;
    expect(ago(now - 20_000, now)).toEqual({ key: 'time.justNow', n: 0 });
    expect(ago(now - 5 * 60_000, now)).toEqual({ key: 'time.minutes', n: 5 });
    expect(ago(now - 3 * 3_600_000, now)).toEqual({ key: 'time.hours', n: 3 });
    expect(ago(now - 50 * 3_600_000, now)).toEqual({ key: 'time.days', n: 2 });
  });

  it('formats numbers and dates per language', () => {
    expect(formatNumber(12345, 'de')).toBe('12.345');
    expect(formatNumber(12345, 'en')).toBe('12,345');
    expect(formatDate(Date.UTC(2027, 2, 5, 12), 'de')).toMatch(/5\. März 2027/);
  });
});
