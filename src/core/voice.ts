import { foldSearch } from './search';
import * as W from './voiceWords';
import type { Prefer, Screen, TimeOfDay, Words } from './voiceWords';

/**
 * Plum, the voice assistant: turns a spoken sentence (already text) into a command.
 * Local rules for English, German and Croatian, all three always on, since speech recognition
 * may hear another language than the app's. The words live in `voiceWords.ts`; this file only
 * has the rules. Unclear sentences come back with `confident: false`, so the caller can ask the
 * optional AI fallback.
 */

export type { Prefer, Screen, TimeOfDay };

/** When a past programme aired. null fields: not said. */
export interface When {
  /** 0 today, -1 yesterday, down to -7. */
  dayOffset: number | null;
  timeOfDay: TimeOfDay | null;
  /** Minutes after midnight ("at 20:15" → 1215). */
  minutes: number | null;
}

export interface PlayCommand {
  kind: 'play';
  /** What to play, folded (lower-case, no accents). For `prefer: 'live'` it may be a channel number. */
  title: string;
  when: When | null;
  /** "… on RTL": the channel it aired on. */
  channel: string | null;
  prefer: Prefer | null;
  season: number | null;
  episode: number | null;
  /** The name as said, with kind words ("filmovi 2026"), for matching category names. */
  phrase: string;
}

export type PlumCommand =
  | PlayCommand
  /** "Play that" (index null: the focused item) or "play number 2" (Plum's last list, 1-based; -1 = the last one). */
  | { kind: 'play-that'; index: number | null }
  | { kind: 'open'; screen: Screen }
  | { kind: 'refresh-epg' }
  | { kind: 'search'; query: string };

export interface Parsed {
  command: PlumCommand | null;
  /** false: rules didn't really understand it (ask the AI fallback when there is one). */
  confident: boolean;
}

const MAX_DAYS_BACK = 7;

/** Lower-case, accents folded, punctuation gone; "20.15" becomes "20:15". Used on speech and on the word lists. */
function normalise(text: string): string {
  return foldSearch(text)
    .replace(/(\d)\.(\d{2})\b/g, '$1:$2')
    .replace(/['’`]/g, '')
    .replace(/[^0-9a-z:\u00c0-\u02af\u0370-\u1fff\u2c00-\ud7ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- building patterns from the word lists

const all = (words: Words): string[] => [...words.en, ...words.de, ...words.hr];
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A regex alternation, longest phrase first so "live tv" wins over "live". */
function alt(words: readonly string[]): string {
  const folded = [...new Set(words.map(normalise).filter(Boolean))].sort((a, b) => b.length - a.length);
  return folded.map((w) => escape(w).replace(/ /g, '\\s+')).join('|');
}
const re = (source: string) => new RegExp(source);
const foldedMap = (maps: Readonly<Record<string, Readonly<Record<string, number>>>>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const map of Object.values(maps)) for (const [word, n] of Object.entries(map)) out[normalise(word)] = n;
  return out;
};

const NUMBER_WORDS = foldedMap(W.NUMBERS);
const ORDINALS = foldedMap(W.ORDINALS);
const NUMBER = `\\d{1,2}|${alt(Object.keys(NUMBER_WORDS))}`;
const toNumber = (word: string): number => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word] ?? NaN);

const WAKE = re(`^(?:(?:${alt(all(W.WAKE_GREETINGS))})\\s+)?(?:${alt(W.WAKE_NAMES)})\\b\\s*`);
const POLITE = re(`\\b(?:${alt(all(W.POLITE))})\\b`);
const LEAD_RE = re(`^(?:${alt(all(W.LEAD))})\\b\\s*`);
const TRAIL_RE = re(`\\s*\\b(?:${alt(all(W.TRAIL))})$`);

const SCREEN_WORDS: readonly [Screen, Set<string>][] = (Object.entries(W.SCREENS) as [Screen, Words][]).map(([screen, words]) => [
  screen,
  new Set(all(words).map(normalise)),
]);
const OPEN_RE = re(`^(?:${alt(all(W.OPEN_VERBS))})\\s+(?:(?:${alt(all(W.OPEN_ARTICLES))})\\s+)?(.+)$`);
const OPEN_CATEGORY_RE = re(`^(?:${alt(all(W.OPEN_CATEGORY_VERBS))})\\s+(?:(?:${alt(all(W.OPEN_ARTICLES))})\\s+)?(.+)$`);
const PAGE_RE = re(`\\s+(?:${alt(all(W.PAGE_WORDS))})$`);

const REFRESH_VERB = re(`\\b(?:${alt(all(W.REFRESH_VERBS))})\\b`);
const REFRESH_NOUN = re(`\\b(?:${alt(all(W.REFRESH_NOUNS))})\\b`);
const SEARCH_RE = re(`^(?:${alt(all(W.SEARCH_VERBS))})\\s+(.+)$`);

const THAT_RE = re(`^(?:${alt(all(W.THAT))})$`);
const INDEX_RE = re(`^(?:${alt(all(W.INDEX_WORDS))})\\s+(${NUMBER})$`);
const ORDINAL_RE = re(`^(?:(?:the|der|die|das|den)\\s+)?(${alt(Object.keys(ORDINALS))})(?:\\s+(?:${alt(all(W.ORDINAL_TAILS))}))?$`);

const SEASON = alt(all(W.SEASON_WORDS));
const EPISODE = alt(all(W.EPISODE_WORDS));
const EPISODE_RE = re(`\\b(?:s(\\d{1,2})\\s*e(\\d{1,3})|(?:${SEASON})\\s+(${NUMBER})(?:\\s+(?:${EPISODE})\\s+(${NUMBER}))?|(?:${EPISODE})\\s+(${NUMBER}))\\b`);

// ---- when it aired

const PREP = `(?:(?:${alt(all(W.TIME_PREPOSITIONS))})\\s+)*`;
const DAY_PATTERNS = W.DAYS.map((d) => ({ ...d, pattern: alt(all(d.words)) })).filter((d) => d.pattern);
const AGO_PATTERN = W.DAYS_AGO.map(({ before, after }) => `${before ? `${alt([before])}\\s+` : ''}(${NUMBER})\\s+${alt([after])}`).join('|');
const LAST = alt(all(W.LAST_WORDS));
const WEEKDAY_PATTERNS = W.WEEKDAYS.map((words) => alt(all(words)));
const PART_PATTERNS = (Object.entries(W.PARTS_OF_DAY) as [TimeOfDay, { words: Words }][]).map(([part, { words }]) => ({ part, pattern: alt(all(words)) }));
const FREE_PART = /^(?:in|at|am|um|zu|zur|u|oko|po|za)\s/;
const CLOCK_RE = re(
  `(?:(?:${alt(all(W.CLOCK_BEFORE))})\\s+(\\d{1,2})(?::(\\d{2}))?(?:\\s*(${alt(W.CLOCK_AFTER)}))?|(\\d{1,2})(?::(\\d{2}))?\\s*(${alt(W.CLOCK_AFTER)})|(\\d{1,2}):(\\d{2}))`,
);
/** Where a time phrase was taken out, so a part of the day next to it counts ("gestern § abend"). */
const MARK = '§';

function dayBack(weekday: number, today: number, last: boolean): number {
  let back = (today - weekday + 7) % 7;
  if (last && back === 0) back = 7;
  return back ? -back : 0;
}

/** The 24h hour for a spoken hour: "8 pm" → 20, "8" in the morning → 8, a bare "8" → 20 (TV is mostly evening). */
export function clockHour(hour: number, mark: string | null, part: TimeOfDay | null): number | null {
  if (hour > 24) return null;
  if (mark === 'pm') return hour < 12 ? hour + 12 : hour;
  if (mark === 'am') return hour === 12 ? 0 : hour;
  if (hour === 0 || hour > 12) return hour % 24;
  if (part) {
    const [from, to] = W.PARTS_OF_DAY[part].hours;
    for (const h of [hour, hour + 12, hour + 24]) if (h >= from && h < to) return h % 24;
  }
  return hour === 12 ? 12 : hour + 12;
}

interface Cut {
  text: string;
  when: When;
}

/** Takes the time words out of the sentence. */
function cutWhen(input: string, now: number): Cut {
  let text = ` ${input} `;
  const when: When = { dayOffset: null, timeOfDay: null, minutes: null };
  const take = (pattern: string): RegExpMatchArray | null => {
    const m = text.match(new RegExp(`\\s${PREP}(?:${pattern})(?=\\s)`));
    if (m) text = text.replace(m[0], ` ${MARK} `);
    return m;
  };

  for (const day of DAY_PATTERNS) {
    if (take(`\\b(?:${day.pattern})\\b`)) {
      when.dayOffset = day.offset;
      if (day.part) when.timeOfDay = day.part;
      break;
    }
  }
  if (when.dayOffset === null) {
    const ago = take(`\\b(?:${AGO_PATTERN})\\b`);
    if (ago) {
      const n = toNumber(ago.slice(1).find((g) => g !== undefined) ?? '');
      if (n >= 0 && n <= MAX_DAYS_BACK) when.dayOffset = -n;
    }
  }
  if (when.dayOffset === null) {
    const today = new Date(now).getDay();
    for (let d = 0; d < 7; d++) {
      const m = take(`(?:(${LAST})\\s+)?\\b(?:${WEEKDAY_PATTERNS[d]})\\b`);
      if (m) {
        when.dayOffset = dayBack(d, today, !!m[1]);
        break;
      }
    }
  }

  const clock = take(`\\b${CLOCK_RE.source}\\b`);

  // Part of the day: the last mention that is next to a day/clock, at the end, or has its own preposition.
  if (when.timeOfDay === null) {
    let best: { part: TimeOfDay; index: number; length: number } | null = null;
    for (const { part, pattern } of PART_PATTERNS) {
      for (const m of text.matchAll(new RegExp(`\\s(${PREP})(${pattern})(?=\\s)`, 'g'))) {
        const index = m.index ?? 0;
        const before = text.slice(0, index).trim();
        const after = text.slice(index + m[0].length).trim();
        const phrase = `${m[1]}${m[2]}`;
        const ok = FREE_PART.test(phrase) || before.endsWith(MARK) || after.startsWith(MARK) || after === '';
        if (ok && (!best || index > best.index)) best = { part, index, length: m[0].length };
      }
    }
    if (best) {
      when.timeOfDay = best.part;
      text = `${text.slice(0, best.index)} ${MARK} ${text.slice(best.index + best.length)}`;
    }
  }

  if (clock) {
    const groups = clock[0].trim().match(CLOCK_RE);
    if (groups) {
      const hour = Number(groups[1] ?? groups[4] ?? groups[7]);
      const min = Number(groups[2] ?? groups[5] ?? groups[8] ?? 0);
      const mark = groups[3] ?? groups[6] ?? null;
      const h = clockHour(hour, mark, when.timeOfDay);
      if (h !== null && min <= 59) when.minutes = h * 60 + min;
    }
  }
  return { text: text.split(MARK).join(' ').replace(/\s+/g, ' ').trim(), when };
}

const words = (text: string) => (text ? text.split(' ').length : 0);
const hasWhen = (w: When) => w.dayOffset !== null || w.timeOfDay !== null || w.minutes !== null;

// ---- the rest of a play sentence

const PREFER_PATTERNS = (Object.entries(W.PREFER_WORDS) as [Prefer, Words][]).map(([prefer, words]) => ({ prefer, pattern: alt(all(words)) }));
const BEFORE_TITLE = re(`^(?:${alt(all(W.BEFORE_TITLE))})\\s+(?:(?:${alt(W.OF_WORDS)})\\s+)?`);
const VAGUE = re(`\\b(?:${alt(all(W.VAGUE))})\\b`);
const POINTING = re(`^(?:${alt(all(W.POINTING))})\\s`);
const CHANNEL_WORD = alt(all(W.CHANNEL_WORDS));
const CHANNEL_RE = re(`^(.+?)\\s+(?:${alt(all(W.CHANNEL_PREPOSITIONS))})\\s+(?:(?:${CHANNEL_WORD})\\s+)?(.+)$`);
const CHANNEL_LEAD_RE = re(`^(?:${CHANNEL_WORD})\\s+(.+)$`);

function cutPrefer(text: string): { text: string; prefer: Prefer | null } {
  for (const { prefer, pattern } of PREFER_PATTERNS) {
    if (re(`^(?:${pattern})$`).test(text)) return { text: '', prefer };
    const lead = text.match(re(`^(?:${pattern})\\s+(.+)$`));
    if (lead) return { text: lead[1], prefer };
    const trail = text.match(re(`^(.+?)\\s+(?:${pattern})$`));
    if (trail) return { text: trail[1], prefer };
  }
  return { text, prefer: null };
}

function stripLead(text: string): string {
  let out = text;
  for (let i = 0; i < 8; i++) {
    const next = out.replace(LEAD_RE, '').replace(TRAIL_RE, '').trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

export function parseCommand(spoken: string, now = Date.now()): Parsed {
  let text = normalise(spoken).replace(WAKE, '').replace(POLITE, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { command: null, confident: false };

  if (REFRESH_VERB.test(text) && REFRESH_NOUN.test(text)) return { command: { kind: 'refresh-epg' }, confident: true };

  const open = text.match(OPEN_RE);
  if (open) {
    // "main menu" is a screen name itself; "the guide page" only after taking "page" off.
    const targets = [open[1], open[1].replace(PAGE_RE, '').trim()];
    const screen = SCREEN_WORDS.find(([, words]) => targets.some((t) => words.has(t)));
    if (screen) return { command: { kind: 'open', screen: screen[0] }, confident: true };
  }

  const search = text.match(SEARCH_RE);
  if (search) return { command: { kind: 'search', query: search[1] }, confident: true };

  // "Open movies 2026": not a screen, so a category.
  const openCategory = text.match(OPEN_CATEGORY_RE);
  let forced: Prefer | null = null;
  if (openCategory) {
    text = openCategory[1];
    forced = 'category';
  }

  text = stripLead(text);
  if (!text) return { command: { kind: 'play-that', index: null }, confident: true };
  if (THAT_RE.test(text)) return { command: { kind: 'play-that', index: null }, confident: true };
  const index = text.match(INDEX_RE);
  if (index) return { command: { kind: 'play-that', index: toNumber(index[1]) }, confident: true };
  const ordinal = text.match(ORDINAL_RE);
  if (ordinal) return { command: { kind: 'play-that', index: ORDINALS[ordinal[1]] }, confident: true };

  let season: number | null = null;
  let episode: number | null = null;
  const ep = text.match(EPISODE_RE);
  if (ep) {
    season = ep[1] ? Number(ep[1]) : ep[3] ? toNumber(ep[3]) : null;
    episode = ep[2] ? Number(ep[2]) : ep[4] ? toNumber(ep[4]) : ep[5] ? toNumber(ep[5]) : null;
    text = text.replace(ep[0], ' ').replace(/\s+/g, ' ').trim();
  }

  const beforeTime = text;
  const cut = cutWhen(text, now);
  text = cut.text;
  let when = hasWhen(cut.when) ? cut.when : null;

  let channel: string | null = null;
  let prefer: Prefer | null = forced;
  const lead = text.match(CHANNEL_LEAD_RE);
  if (lead) {
    text = lead[1];
    prefer = 'live';
  } else {
    const on = text.match(CHANNEL_RE);
    if (on) {
      text = on[1];
      channel = on[2];
      // "… on catch up" names a kind, not a channel.
      const kind = cutPrefer(channel);
      if (!kind.text) {
        prefer = kind.prefer;
        channel = null;
      }
    }
  }
  const named = stripLead(text);
  const pref = cutPrefer(named);
  // "category movies 2026": the category word goes, "movies" stays (it's in the name).
  let phrase = pref.prefer === 'category' ? pref.text : named;
  text = pref.text.replace(BEFORE_TITLE, '').trim();
  prefer = prefer ?? pref.prefer;

  if (!text) {
    if (channel) {
      // "play RTL from yesterday": the channel was the only name.
      text = channel;
      phrase = channel;
      channel = null;
    } else if (when && words(beforeTime) - words(cut.text) === 1) {
      // The title was one time word ("play the movie Yesterday").
      const again = cutPrefer(stripLead(beforeTime));
      text = again.text.replace(BEFORE_TITLE, '').trim();
      phrase = stripLead(beforeTime);
      prefer = prefer ?? again.prefer;
      when = null;
    }
    if (!text) return { command: null, confident: false };
  }
  if (!prefer && when) prefer = 'catchup';
  if (season !== null || episode !== null) prefer = 'series';
  if (prefer === 'live' && when) prefer = 'catchup';

  const vague = VAGUE.test(text) || POINTING.test(text) || text.split(' ').length > 6;
  return {
    command: { kind: 'play', title: text, when, channel, prefer, season, episode, phrase: phrase || text },
    confident: !vague && text.length >= 2,
  };
}

export interface Heard extends Parsed {
  /** The alternative that was used. */
  text: string;
}

/**
 * Speech recognition gives a few alternatives, best first. Takes the first one the rules are
 * confident about, else the first that gave any command, else the best guess (nothing understood).
 */
export function parseBest(alternatives: readonly string[], now = Date.now()): Heard {
  const parsed = alternatives.map((text) => ({ text, ...parseCommand(text, now) }));
  return (
    parsed.find((p) => p.command && p.confident) ??
    parsed.find((p) => p.command) ?? { text: alternatives[0] ?? '', command: null, confident: false }
  );
}
