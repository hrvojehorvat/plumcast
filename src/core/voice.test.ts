import { describe, expect, it } from 'vitest';
import { clockHour, parseBest, parseCommand, type PlayCommand } from './voice';

// Saturday, 21 November 2026, 21:00 local time.
const now = new Date(2026, 10, 21, 21, 0).getTime();

const play = (text: string) => {
  const parsed = parseCommand(text, now);
  expect(parsed.command?.kind).toBe('play');
  return { ...(parsed.command as PlayCommand), confident: parsed.confident };
};

describe('playing a past programme', () => {
  it('understands the example in all three languages', () => {
    for (const text of ['Hey Plum, play me MasterChef from yesterday', 'Spiel mir MasterChef von gestern', 'Pusti mi MasterChef od jučer']) {
      const c = play(text);
      expect(c.title).toBe('masterchef');
      expect(c.when).toEqual({ dayOffset: -1, timeOfDay: null, minutes: null });
      expect(c.prefer).toBe('catchup');
      expect(c.confident).toBe(true);
    }
  });

  it('reads the part of the day and the clock', () => {
    expect(play('play the news from last night').when).toEqual({ dayOffset: -1, timeOfDay: 'night', minutes: null });
    expect(play('Tagesschau gestern um 20 Uhr').when).toEqual({ dayOffset: -1, timeOfDay: null, minutes: 20 * 60 });
    expect(play('pusti dnevnik jučer u 19:30').when).toEqual({ dayOffset: -1, timeOfDay: null, minutes: 19 * 60 + 30 });
    expect(play('play the voice today at 8 pm').when?.minutes).toBe(20 * 60);
    expect(play('play the voice today at 8').when?.minutes).toBe(20 * 60);
    expect(play('play the morning show this morning at 8').when).toEqual({ dayOffset: 0, timeOfDay: 'morning', minutes: 8 * 60 });
    expect(play('Tatort gestern um 20.15').when?.minutes).toBe(20 * 60 + 15);
  });

  it('turns weekdays into days back (today counts, "last" means a week ago)', () => {
    expect(play('play masterchef from thursday').when?.dayOffset).toBe(-2);
    expect(play('spiel masterchef vom montag').when?.dayOffset).toBe(-5);
    expect(play('pusti masterchef u subotu').when?.dayOffset).toBe(0);
    expect(play('play masterchef from last saturday').when?.dayOffset).toBe(-7);
    expect(play('pusti masterchef od prekjučer').when?.dayOffset).toBe(-2);
    expect(play('play masterchef from 3 days ago').when?.dayOffset).toBe(-3);
  });

  it('takes the channel after "on" / "auf" / "na"', () => {
    const c = play('play masterchef from yesterday on RTL');
    expect(c).toMatchObject({ title: 'masterchef', channel: 'rtl' });
    expect(play('Spiel Wer wird Millionär gestern auf RTL')).toMatchObject({ title: 'wer wird millionar', channel: 'rtl' });
    expect(play('pusti dnevnik od jučer na HRT 1')).toMatchObject({ title: 'dnevnik', channel: 'hrt 1' });
  });

  it('drops filler around the title', () => {
    expect(play('could you please play the latest episode of masterchef from yesterday').title).toBe('masterchef');
    expect(play('ich möchte gestern Tatort sehen').title).toBe('tatort');
    expect(play('hoću gledati Survivor od jučer molim').title).toBe('survivor');
  });
});

describe('parts of the day', () => {
  it('knows many words for them', () => {
    expect(play('play the news from yesterday at noon').when).toMatchObject({ dayOffset: -1, timeOfDay: 'midday' });
    expect(play('Tagesschau gestern Mittag').when).toMatchObject({ dayOffset: -1, timeOfDay: 'midday' });
    expect(play('pusti vijesti jučer u podne').when).toMatchObject({ dayOffset: -1, timeOfDay: 'midday' });
    expect(play('spiel die Nachrichten von gestern Abend').when).toMatchObject({ dayOffset: -1, timeOfDay: 'evening' });
    expect(play('pusti dnevnik od jučer navečer').when).toMatchObject({ dayOffset: -1, timeOfDay: 'evening' });
    expect(play('pusti dnevnik sinoć').when).toMatchObject({ dayOffset: -1, timeOfDay: 'night' });
    expect(play('play the late show yesterday at midnight').when).toMatchObject({ dayOffset: -1, timeOfDay: 'night' });
    expect(play('play the news in prime time').when).toMatchObject({ timeOfDay: 'evening' });
    expect(play('spiel Wetter heute früh').when).toMatchObject({ dayOffset: 0, timeOfDay: 'morning' });
  });

  it('uses the part of the day to read the clock', () => {
    expect(play('play the news yesterday at 8 in the morning').when?.minutes).toBe(8 * 60);
    expect(play('play the news yesterday at 8 in the evening').when?.minutes).toBe(20 * 60);
    expect(play('pusti vijesti jučer u 3 popodne').when?.minutes).toBe(15 * 60);
    expect(play('play the news yesterday at 1 at night').when?.minutes).toBe(60);
    expect(play('Tagesschau gestern um 7 Uhr morgens').when?.minutes).toBe(7 * 60);
  });

  it('leaves part-of-day words inside titles alone', () => {
    expect(play('play good morning america from yesterday').title).toBe('good morning america');
    expect(play('play late night with seth meyers from yesterday').title).toBe('late night with seth meyers');
  });

  it('keeps a title that is a time word', () => {
    expect(play('play the movie Yesterday')).toMatchObject({ title: 'yesterday', prefer: 'movie', when: null });
  });
});

describe('clockHour', () => {
  it('follows am/pm, the part of the day, or else the evening', () => {
    expect(clockHour(8, 'pm', null)).toBe(20);
    expect(clockHour(12, 'am', null)).toBe(0);
    expect(clockHour(8, null, 'morning')).toBe(8);
    expect(clockHour(8, null, 'evening')).toBe(20);
    expect(clockHour(1, null, 'night')).toBe(1);
    expect(clockHour(11, null, 'night')).toBe(23);
    expect(clockHour(12, null, 'midday')).toBe(12);
    expect(clockHour(8, null, null)).toBe(20);
    expect(clockHour(18, null, 'morning')).toBe(18);
  });
});

describe('other kinds of play', () => {
  it('live channels, by name or number', () => {
    expect(play('switch to channel RTL')).toMatchObject({ title: 'rtl', prefer: 'live', when: null });
    expect(play('schalte auf ZDF live')).toMatchObject({ title: 'zdf', prefer: 'live' });
    expect(play('play channel 5')).toMatchObject({ title: '5', prefer: 'live' });
  });

  it('movies and series episodes', () => {
    expect(play('play the movie Inception')).toMatchObject({ title: 'inception', prefer: 'movie' });
    expect(play('spiel den Film Inception')).toMatchObject({ title: 'inception', prefer: 'movie' });
    expect(play('play breaking bad season 2 episode 3')).toMatchObject({ title: 'breaking bad', prefer: 'series', season: 2, episode: 3 });
    expect(play('pusti Breaking Bad sezona dva epizoda pet')).toMatchObject({ season: 2, episode: 5 });
    expect(play('play friends s01e04')).toMatchObject({ title: 'friends', season: 1, episode: 4 });
  });

  it('leaves a plain "play X" open for the resolver to decide', () => {
    expect(play('play masterchef')).toMatchObject({ title: 'masterchef', prefer: null, when: null });
  });

  it('is not confident about vague requests (they go to the AI fallback)', () => {
    expect(play('play that cooking show from last night').confident).toBe(false);
    expect(play('spiel irgendwas mit Kochen von gestern').confident).toBe(false);
  });
});

describe('play that', () => {
  it('means the focused item', () => {
    for (const text of ['play that', 'Spiel das', 'pusti to', 'plum play this one']) {
      expect(parseCommand(text, now)).toEqual({ command: { kind: 'play-that', index: null }, confident: true });
    }
  });

  it('or a numbered item from the last list', () => {
    expect(parseCommand('the last one', now).command).toEqual({ kind: 'play-that', index: -1 });
    expect(parseCommand('pusti zadnji', now).command).toEqual({ kind: 'play-that', index: -1 });
    expect(parseCommand('play number 2', now).command).toEqual({ kind: 'play-that', index: 2 });
    expect(parseCommand('the second one', now).command).toEqual({ kind: 'play-that', index: 2 });
    expect(parseCommand('Nummer drei', now).command).toEqual({ kind: 'play-that', index: 3 });
    expect(parseCommand('pusti broj 4', now).command).toEqual({ kind: 'play-that', index: 4 });
    expect(parseCommand('drugi', now).command).toEqual({ kind: 'play-that', index: 2 });
  });
});

describe('app commands', () => {
  it('opens screens', () => {
    expect(parseCommand('open the TV guide', now).command).toEqual({ kind: 'open', screen: 'guide' });
    expect(parseCommand('öffne die Einstellungen', now).command).toEqual({ kind: 'open', screen: 'settings' });
    expect(parseCommand('idi na filmove', now).command).toEqual({ kind: 'open', screen: 'movies' });
    expect(parseCommand('go to the catch up screen', now).command).toEqual({ kind: 'open', screen: 'catchup' });
    expect(parseCommand('show me whats on', now).command).toEqual({ kind: 'open', screen: 'guide' });
    expect(parseCommand('geh zur Mediathek', now).command).toEqual({ kind: 'open', screen: 'catchup' });
    expect(parseCommand('otvori postavke', now).command).toEqual({ kind: 'open', screen: 'settings' });
    expect(parseCommand('vrati se na početnu', now).command).toEqual({ kind: 'open', screen: 'home' });
    expect(parseCommand('open the main menu', now).command).toEqual({ kind: 'open', screen: 'home' });
  });

  it('does not take "show me <title>" for a screen', () => {
    expect(parseCommand('show me masterchef', now).command).toMatchObject({ kind: 'play', title: 'masterchef' });
  });

  it('refreshes the guide', () => {
    for (const text of ['refresh the TV guide', 'update EPG', 'EPG aktualisieren', 'lade das Programm neu', 'osvježi TV vodič']) {
      expect(parseCommand(text, now).command).toEqual({ kind: 'refresh-epg' });
    }
  });

  it('searches', () => {
    expect(parseCommand('search for masterchef', now).command).toEqual({ kind: 'search', query: 'masterchef' });
    expect(parseCommand('suche nach Tatort', now).command).toEqual({ kind: 'search', query: 'tatort' });
    expect(parseCommand('potraži dnevnik', now).command).toEqual({ kind: 'search', query: 'dnevnik' });
  });

  it('gives up on empty input', () => {
    expect(parseCommand('', now)).toEqual({ command: null, confident: false });
    expect(parseCommand('hey plum', now)).toEqual({ command: null, confident: false });
  });
});

describe('parseBest', () => {
  it('takes the first alternative the rules are sure about', () => {
    const heard = parseBest(['play that cooking show', 'play masterchef from yesterday'], now);
    expect(heard.text).toBe('play masterchef from yesterday');
    expect(heard.confident).toBe(true);
  });

  it('falls back to the first with a command, then to nothing', () => {
    expect(parseBest(['play that cooking show', 'hey plum'], now)).toMatchObject({ text: 'play that cooking show', confident: false });
    expect(parseBest(['hey plum'], now)).toEqual({ text: 'hey plum', command: null, confident: false });
    expect(parseBest([], now)).toEqual({ text: '', command: null, confident: false });
  });
});
