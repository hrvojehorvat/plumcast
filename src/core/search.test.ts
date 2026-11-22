import { describe, expect, it } from 'vitest';
import { isSearchable, likeAny, orderProgrammeHits, rememberSearch } from './search';

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

describe('likeAny', () => {
  it('matches any spelling in one condition', () => {
    expect(likeAny('m.search', ['Horror movies', 'horror', 'HORROR'])).toEqual({
      sql: "(m.search LIKE ? ESCAPE '\\' OR m.search LIKE ? ESCAPE '\\')",
      params: ['%horror movies%', '%horror%'],
    });
  });

  it('can also ignore spaces in the column', () => {
    expect(likeAny('search', 'master chef', true)?.params).toEqual(['%master chef%', '%masterchef%']);
    expect(likeAny('search', 'master chef', true)?.sql).toContain("replace(search, ' ', '') LIKE ?");
  });

  it('is null with nothing to match', () => {
    expect(likeAny('search', ['', '  '])).toBeNull();
  });
});
