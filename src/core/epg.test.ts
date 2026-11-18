import { describe, expect, it } from 'vitest';
import { decodeBase64Utf8, nowNext, parseShortEpg } from './epg';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('decodeBase64Utf8', () => {
  it('decodes ASCII, umlauts, Croatian letters and emoji', () => {
    for (const s of ['Tagesschau', 'Größe & Übermut', 'Dnevnik HRT-a: čćžšđ', 'Film 🎬', '']) expect(decodeBase64Utf8(b64(s))).toBe(s);
  });
});

describe('parseShortEpg', () => {
  it('decodes titles, uses unix timestamps, sorts and drops broken entries', () => {
    const json = {
      epg_listings: [
        { title: b64('Später'), description: b64('Zweite'), start_timestamp: '2000', stop_timestamp: '3000' },
        { title: b64('Jetzt'), description: '', start_timestamp: 1000, stop_timestamp: '2000' },
        { title: b64('Kaputt'), start_timestamp: '3000', stop_timestamp: '3000' },
        { title: 'Plain title', start_timestamp: '3000', stop_timestamp: '4000' },
      ],
    };
    expect(parseShortEpg(json)).toEqual([
      { start: 1_000_000, end: 2_000_000, title: 'Jetzt', description: null },
      { start: 2_000_000, end: 3_000_000, title: 'Später', description: 'Zweite' },
      { start: 3_000_000, end: 4_000_000, title: 'Plain title', description: null },
    ]);
  });

  it('copes with empty or odd answers', () => {
    expect(parseShortEpg([])).toEqual([]);
    expect(parseShortEpg({ epg_listings: null })).toEqual([]);
  });
});

describe('nowNext', () => {
  const list = [
    { start: 0, end: 100, title: 'A', description: null },
    { start: 100, end: 300, title: 'B', description: null },
    { start: 300, end: 400, title: 'C', description: null },
  ];
  it('finds the current and next programme with progress', () => {
    expect(nowNext(list, 150)).toEqual({ now: list[1], next: list[2], progress: 0.25 });
  });
  it('has only a next one in a gap or before the start', () => {
    expect(nowNext(list.slice(2), 150)).toEqual({ now: null, next: list[2], progress: 0 });
    expect(nowNext(list, 500)).toEqual({ now: null, next: null, progress: 0 });
  });
});
