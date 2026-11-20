import { describe, expect, it } from 'vitest';
import { isSearchable, orderProgrammeHits, rememberSearch } from './search';

describe('isSearchable', () => {
  it('needs two letters after trimming', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('  a ')).toBe(false);
    expect(isSearchable('ab')).toBe(true);
  });
});

describe('rememberSearch', () => {
  it('puts the newest first and drops duplicates ignoring case and accents', () => {
    expect(rememberSearch(['news', 'Cesko'], 'Česko')).toEqual(['Česko', 'news']);
  });

  it('keeps at most max entries', () => {
    expect(rememberSearch(['a1', 'a2', 'a3'], 'a4', 3)).toEqual(['a4', 'a1', 'a2']);
  });

  it('ignores queries too short to search and tidies spaces', () => {
    expect(rememberSearch(['news'], ' x ')).toEqual(['news']);
    expect(rememberSearch([], '  the   news ')).toEqual(['the news']);
  });
});

describe('orderProgrammeHits', () => {
  const now = 1_000_000;
  const hit = (name: string, start: number, end: number) => ({ name, programme: { start, end } });

  it('shows on now, then upcoming soonest first, then past newest first', () => {
    const hits = [
      hit('old', now - 9000, now - 8000),
      hit('later', now + 5000, now + 6000),
      hit('recent', now - 3000, now - 2000),
      hit('live', now - 100, now + 100),
      hit('soon', now + 1000, now + 2000),
    ];
    expect(orderProgrammeHits(hits, now).map((h) => h.name)).toEqual(['live', 'soon', 'later', 'recent', 'old']);
  });
});
