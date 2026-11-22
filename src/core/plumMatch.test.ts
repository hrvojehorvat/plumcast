import { describe, expect, it } from 'vitest';
import { categoryMatches, categoryScore, channelKey, channelScore, countryWords, saidSection, soundKey, soundScore, withoutCountry, bareTitle, isSure, rankByName, rankProgrammes, sameTitle, searchVariants, titleScore, whenWindow } from './plumMatch';

// Saturday, 21 November 2026, 21:00 local time.
const now = new Date(2026, 10, 21, 21, 0).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

describe('titleScore', () => {
  it('prefers exact, then spacing, then starts-with, then contains', () => {
    expect(titleScore('masterchef', 'MasterChef')).toBe(1);
    expect(titleScore('master chef', 'MasterChef')).toBe(0.95);
    expect(titleScore('masterchef', 'MasterChef Australia')).toBe(0.85);
    expect(titleScore('masterchef', 'Junior MasterChef')).toBe(0.8);
    expect(titleScore('chef', 'MasterChef')).toBe(0.7);
    expect(titleScore('wer wird millionar', 'Wer wird Millionär?')).toBe(1);
  });

  it('keeps a title said with extra words (a country, a channel)', () => {
    expect(titleScore('masterchef hrvatska', 'MasterChef')).toBe(0.7);
    expect(titleScore('tagesschau ard', 'Tagesschau')).toBe(0.7);
    expect(titleScore('news today', 'TV')).toBeLessThan(0.5);
  });

  it('gives partial credit for some words and nothing for none', () => {
    const some = titleScore('breaking news tonight', 'Breaking Bad');
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(0.7);
    expect(titleScore('masterchef', 'Tagesschau')).toBe(0);
  });
});

describe('channel names', () => {
  it('ignore quality tags and a country prefix', () => {
    expect(channelKey('DE | RTL HD')).toBe('de rtl');
    expect(channelScore('rtl', 'DE: RTL HD')).toBe(1);
    expect(channelScore('hrt 1', 'HR | HRT 1 FHD')).toBe(1);
    expect(channelScore('rtl', 'RTL 2 HD')).toBe(0.85);
    expect(channelScore('rtl', 'RTL2')).toBeLessThan(0.85);
  });
});

describe('searchVariants', () => {
  it('adds the spaceless form and the longest word', () => {
    expect(searchVariants('master chef')).toEqual(['master chef', 'masterchef', 'master']);
    expect(searchVariants('Tatort')).toEqual(['tatort']);
  });
});

describe('whenWindow', () => {
  it('a day is a TV day (05:00 to 05:00), aimed at prime time', () => {
    expect(whenWindow({ dayOffset: -1, timeOfDay: null, minutes: null }, now)).toEqual({ from: at(20, 5), to: at(21, 5), around: at(20, 20) });
  });

  it('today aims at prime time, but never later than now', () => {
    const early = at(21, 15);
    expect(whenWindow({ dayOffset: 0, timeOfDay: null, minutes: null }, early).around).toBe(early);
  });

  it('a part of the day uses its hours, night runs past midnight', () => {
    expect(whenWindow({ dayOffset: -1, timeOfDay: 'morning', minutes: null }, now)).toMatchObject({ from: at(20, 5), to: at(20, 12) });
    expect(whenWindow({ dayOffset: -1, timeOfDay: 'night', minutes: null }, now)).toMatchObject({ from: at(20, 19), to: at(21, 5) });
  });

  it('a clock time looks at what was on then and the next half hour', () => {
    expect(whenWindow({ dayOffset: -1, timeOfDay: null, minutes: 20 * 60 + 15 }, now)).toEqual({ from: at(20, 20, 15), to: at(20, 20, 45), around: at(20, 20, 15) });
  });

  it('without a day takes the most recent one that already started', () => {
    expect(whenWindow({ dayOffset: null, timeOfDay: null, minutes: 20 * 60 }, now).around).toBe(at(21, 20));
    expect(whenWindow({ dayOffset: null, timeOfDay: null, minutes: 22 * 60 }, now).around).toBe(at(20, 22));
    expect(whenWindow({ dayOffset: null, timeOfDay: 'morning', minutes: null }, now).from).toBe(at(21, 5));
  });
});

describe('ranking', () => {
  const hit = (title: string, channel: string, start: number) => ({ channel: { name: channel }, programme: { title, start, end: start + 3_600_000 } });

  it('puts the right title first, then the said channel, then the closest time', () => {
    const hits = [
      hit('MasterChef Australia', 'Food HD', at(20, 20)),
      hit('MasterChef', 'RTL', at(20, 14)),
      hit('MasterChef', 'RTL', at(20, 20, 15)),
      hit('MasterChef', 'VOX', at(20, 20, 15)),
      hit('Tagesschau', 'ARD', at(20, 20)),
    ];
    const ranked = rankProgrammes(hits, 'masterchef', 'rtl', at(20, 20));
    expect(ranked.map((r) => [r.item.channel.name, r.item.programme.start])).toEqual([
      ['RTL', at(20, 20, 15)],
      ['RTL', at(20, 14)],
      ['VOX', at(20, 20, 15)],
      ['Food HD', at(20, 20)],
    ]);
    expect(isSure(ranked, (a, b) => sameTitle(a.programme.title, b.programme.title))).toBe(true);
  });

  it('is unsure when two different titles fit about equally', () => {
    const ranked = rankByName([{ name: 'MasterChef Australia' }, { name: 'MasterChef Junior' }], 'masterchef', (m) => m.name);
    expect(isSure(ranked, (a, b) => a.name === b.name)).toBe(false);
  });

  it('is unsure when the best is weak', () => {
    const ranked = rankByName([{ name: 'MasterChef' }], 'chef', (m) => m.name);
    expect(isSure(ranked, () => false)).toBe(false);
  });
});

describe('countries', () => {
  it('a said country comes first, then the app language', () => {
    const words = countryWords('masterchef srbija', 'hr');
    expect(words.indexOf('rs')).toBeLessThan(words.indexOf('hr'));
    expect(words).toContain('hrvatska');
    expect(countryWords('masterchef', 'de')).toContain('deutschland');
  });

  it('match category names by whole words', () => {
    const hr = countryWords('masterchef hrvatska', null);
    expect(categoryMatches('HR | Hrvatska', hr)).toBe(true);
    expect(categoryMatches('EX-YU', hr)).toBe(true);
    expect(categoryMatches('Christmas', hr)).toBe(false);
    expect(categoryMatches('DE | Sport', hr)).toBe(false);
  });
});

describe('withoutCountry', () => {
  it('takes country words out of a title, unless nothing is left', () => {
    expect(withoutCountry('masterchef croatia')).toBe('masterchef');
    expect(withoutCountry('MasterChef Hrvatska')).toBe('masterchef');
    expect(withoutCountry('tagesschau')).toBe('tagesschau');
    expect(withoutCountry('croatia')).toBe('croatia');
  });
});

describe('categories', () => {
  it('match kind words in any language', () => {
    expect(categoryScore('filmovi 2026', 'Movies 2026')).toBe(1);
    expect(categoryScore('movies 2026', 'EN | Movies 2026')).toBe(0.8);
    expect(categoryScore('filme 2026', 'FILMOVI 2026 HD')).toBeGreaterThanOrEqual(0.8);
    expect(categoryScore('serije', 'Series | Netflix')).toBeGreaterThanOrEqual(0.8);
  });

  it('read genres and countries as the playlist names them', () => {
    expect(categoryScore('horror movies', 'EN | Horror')).toBeGreaterThanOrEqual(0.8);
    expect(categoryScore('horor filmovi', 'Horror')).toBeGreaterThanOrEqual(0.7);
    expect(categoryScore('action', 'Movies | Action & Adventure')).toBeGreaterThanOrEqual(0.7);
    expect(categoryScore('sport exyu', 'SPORTS - EX-YU')).toBeGreaterThanOrEqual(0.7);
    expect(categoryScore('hrvatska', 'Croatia')).toBe(1);
    expect(categoryScore('kanali srbija', 'Serbia HD')).toBeGreaterThanOrEqual(0.7);
  });

  it('need every word said in the name', () => {
    expect(categoryScore('movies', 'Horror')).toBe(0);
    expect(categoryScore('akcija', 'Action')).toBe(0);
    expect(categoryScore('movie inception', 'Movies')).toBe(0);
    expect(categoryScore('movies 2026', 'Movies 2025')).toBe(0);
  });

  it('know which section was said', () => {
    expect(saidSection('filmovi 2026')).toBe('movies');
    expect(saidSection('serien netflix')).toBe('series');
    expect(saidSection('kanali sport')).toBe('live');
    expect(saidSection('masterchef')).toBeNull();
  });
});

describe('bareTitle', () => {
  it('drops language tags, years and quality from catalog names', () => {
    expect(bareTitle('EN - WALL·E (2008)')).toBe('WALL·E');
    expect(bareTitle('[DE] Oben (2009) HD')).toBe('Oben');
    expect(bareTitle('HR | Gospodar prstenova (Multi-Sub)')).toBe('Gospodar prstenova');
    expect(bareTitle('Up')).toBe('Up');
    expect(bareTitle('WALL-E')).toBe('WALL-E');
    expect(bareTitle('EN| Up (2009)')).toBe('Up');
  });
});

describe('sound', () => {
  it('hears misheard titles as the same', () => {
    expect(soundKey('WALL·E')).toBe('vl');
    expect(soundKey('volley')).toBe('vl');
    expect(soundKey('voli')).toBe('vl');
    expect(soundScore('volley', 'WALL-E')).toBe(0.75);
    expect(soundScore('mona', 'Moana')).toBe(0.75);
    expect(soundScore('voli', 'EN - WALL·E (2008)')).toBe(0.75);
    expect(soundScore('volley', '[EN] WALL·E 4K')).toBe(0.75);
  });

  it('stays below a sure match and needs about the same number of words', () => {
    expect(soundScore('volley', 'WALL·E')).toBeLessThan(0.8);
    expect(soundScore('volley', 'The Wall Street Journal Special')).toBe(0);
    expect(soundScore('a', 'Avatar')).toBe(0);
  });
});
