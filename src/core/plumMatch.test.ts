import { describe, expect, it } from 'vitest';
import { categoryMatches, channelKey, channelScore, countryWords, withoutCountry, isSure, rankByName, rankProgrammes, sameTitle, searchVariants, titleScore, whenWindow } from './plumMatch';

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
