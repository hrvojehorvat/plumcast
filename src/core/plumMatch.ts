import { foldSearch } from './search';
import type { When } from './voice';
import type { Lang } from './i18n';
import { splitTitle } from './vod';
import { CATEGORY_KINDS, COUNTRIES, PARTS_OF_DAY, type CategorySection } from './voiceWords';

/**
 * Matching what Plum heard against the catalog: how well a spoken title fits a name, which time
 * window a spoken "when" means, and which found item is the best.
 */

const HOUR = 3_600_000;

/** Lower-case, accents and punctuation gone, single spaces. */
const clean = (text: string) => foldSearch(text).replace(/[^0-9a-zÀ-ʯͰ-῿Ⰰ-퟿]+/g, ' ').trim();

/**
 * 0…1: how well `title` fits what was said. 1 exact, ~0.95 same without spaces ("master chef" /
 * "MasterChef"), ~0.85 starts with it, ~0.8 contains it as words, ~0.7 inside a word, less for
 * some words in common, 0 for nothing.
 */
export function titleScore(said: string, title: string): number {
  const q = clean(said);
  const t = clean(title);
  if (!q || !t) return 0;
  if (t === q) return 1;
  const qc = q.replace(/ /g, '');
  const tc = t.replace(/ /g, '');
  if (tc === qc) return 0.95;
  if (t.startsWith(`${q} `)) return 0.85;
  if (` ${t} `.includes(` ${q} `)) return 0.8;
  if (tc.includes(qc)) return 0.7;
  // The whole title is inside what was said, with extra words ("masterchef hrvatska" → "MasterChef").
  if (` ${q} `.includes(` ${t} `) || qc.includes(tc)) return t.length >= 4 ? 0.7 : 0.4;
  // Some of the spoken words appear in the title.
  const qWords = q.split(' ').filter((w) => w.length >= 3);
  if (!qWords.length) return 0;
  const tWords = t.split(' ');
  const found = qWords.filter((w) => tWords.some((tw) => tw === w || (w.length >= 4 && tw.startsWith(w)))).length;
  return 0.6 * (found / qWords.length) * Math.min(1, qWords.length / tWords.length + 0.5);
}

/** Picture-quality and similar tags that say nothing about which channel it is. */
const CHANNEL_NOISE = new Set(['hd', 'fhd', 'uhd', 'sd', '4k', '8k', 'hevc', 'h265', 'h264', 'raw', 'backup', 'tv', 'live']);

/** Channel name without quality tags ("DE | RTL HD" → "de rtl"). */
export function channelKey(name: string): string {
  const words = clean(name).split(' ').filter((w) => w && !CHANNEL_NOISE.has(w));
  return words.join(' ') || clean(name);
}

/** Like `titleScore`, for channel names: ignores quality tags and a country prefix ("DE: RTL"). */
export function channelScore(said: string, name: string): number {
  const q = channelKey(said);
  const key = channelKey(name);
  const words = key.split(' ');
  const withoutCountry = words.length > 1 && words[0].length === 2 ? words.slice(1).join(' ') : key;
  return Math.max(titleScore(q, key), titleScore(q, withoutCountry));
}

/** Queries to run against the LIKE search: as said, without spaces, and the longest word alone. */
export function searchVariants(said: string): string[] {
  const q = clean(said);
  if (!q) return [];
  const out = [q];
  if (q.includes(' ')) {
    out.push(q.replace(/ /g, ''));
    const longest = [...q.split(' ')].sort((a, b) => b.length - a.length)[0];
    if (longest.length >= 4) out.push(longest);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- when

export interface TimeWindow {
  /** Programmes that overlap [from, to) count. */
  from: number;
  to: number;
  /** The moment the user most likely meant; closer programmes rank higher. */
  around: number;
}

/** Local midnight `days` from the day of `ms` (DST-safe), plus `hours` (may go past 24). */
function dayAt(ms: number, days: number, hours: number, minutes = 0): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

/** A TV day runs from 05:00 to 05:00, so a programme at 00:30 still counts as "yesterday evening". */
const TV_DAY: readonly [number, number] = [5, 29];
const PRIME_TIME = 20;
/** Around a spoken clock time: what was on then, or started a little later. */
const CLOCK_BEFORE_MS = 0;
const CLOCK_AFTER_MS = 30 * 60_000;

/**
 * The time window a spoken "when" means. Without a day: the most recent one that already
 * started ("at 20:15" said at 21:00 → today, said at 19:00 → yesterday).
 */
export function whenWindow(when: When, now: number): TimeWindow {
  const nowHours = (now - dayAt(now, 0, 0)) / HOUR;
  let day = when.dayOffset;
  if (day === null) {
    const startHours = when.minutes !== null ? when.minutes / 60 : when.timeOfDay ? PARTS_OF_DAY[when.timeOfDay].hours[0] : 0;
    day = startHours <= nowHours ? 0 : -1;
  }
  if (when.minutes !== null) {
    const at = dayAt(now, day, 0, when.minutes);
    return { from: at - CLOCK_BEFORE_MS, to: at + CLOCK_AFTER_MS, around: at };
  }
  const [fromH, toH] = when.timeOfDay ? PARTS_OF_DAY[when.timeOfDay].hours : TV_DAY;
  const from = dayAt(now, day, fromH);
  const to = dayAt(now, day, toH);
  const around = when.timeOfDay ? from + (to - from) / 2 : dayAt(now, day, PRIME_TIME);
  return { from, to, around: Math.min(around, now) };
}

// ---------------------------------------------------------------- ranking

export interface Ranked<T> {
  item: T;
  score: number;
}

export interface ProgrammeHit {
  channel: { name: string };
  programme: { start: number; end: number; title: string };
}

/** Below this a title isn't the one meant. */
export const MIN_TITLE_SCORE = 0.5;
/** Strong enough to play without asking. */
export const SURE_SCORE = 0.8;

/**
 * Found programmes, best first: title fit, then the said channel, then how close to `around`
 * (the programme running at that moment counts as closest).
 */
export function rankProgrammes<T extends ProgrammeHit>(hits: readonly T[], title: string, channel: string | null, around: number): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const hit of hits) {
    const fit = titleScore(title, hit.programme.title);
    if (fit < MIN_TITLE_SCORE) continue;
    const { start, end } = hit.programme;
    const distance = start <= around && around < end ? 0 : Math.abs(start - around);
    let score = fit - Math.min(distance / (12 * HOUR), 1) * 0.15;
    if (channel) score += channelScore(channel, hit.channel.name) >= 0.7 ? 0.1 : -0.4;
    out.push({ item: hit, score });
  }
  return out.sort((a, b) => b.score - a.score || b.item.programme.start - a.item.programme.start);
}

/** Items ranked by how well `name(item)` fits, best first; weak fits left out. */
export function rankByName<T>(items: readonly T[], said: string, name: (item: T) => string, score = titleScore): Ranked<T>[] {
  return items
    .map((item) => ({ item, score: score(said, name(item)) }))
    .filter((r) => r.score >= MIN_TITLE_SCORE)
    .sort((a, b) => b.score - a.score);
}

/**
 * True when the best is clearly the one: strong enough, and the runner-up is either the same
 * thing (`same`, e.g. the same title on another channel) or clearly weaker.
 */
export function isSure<T>(ranked: readonly Ranked<T>[], same: (a: T, b: T) => boolean): boolean {
  const [best, next] = ranked;
  if (!best || best.score < SURE_SCORE) return false;
  return !next || same(best.item, next.item) || next.score <= best.score - 0.1;
}

export const sameTitle = (a: string, b: string) => clean(a) === clean(b);

/**
 * Category names to search first for catch-up: the countries said in the title, then the app
 * language's country. Returns the words to look for in category names, most wanted first.
 */
export function countryWords(said: string, lang: Lang | null): string[] {
  const words = new Set(clean(said).split(' '));
  const spoken = COUNTRIES.filter((c) => c.said.some((w) => words.has(clean(w))));
  const own = COUNTRIES.filter((c) => c.lang === lang);
  return [...new Set([...spoken, ...own].flatMap((c) => c.categories.map(clean)))];
}

/** True when a category name is about one of those words ("HR | Hrvatska HD" ~ "hr"). */
export function categoryMatches(name: string, words: readonly string[]): boolean {
  const padded = ` ${clean(name)} `;
  return words.some((w) => padded.includes(` ${w} `));
}

/**
 * The title without country words: "masterchef croatia" → "masterchef". The country says where
 * to look, it isn't part of the name. Keeps the words when nothing else is left.
 */
export function withoutCountry(said: string): string {
  const countries = new Set(COUNTRIES.flatMap((c) => c.said.map(clean)));
  const words = clean(said).split(' ').filter(Boolean);
  const rest = words.filter((w) => !countries.has(w));
  return (rest.length ? rest : words).join(' ');
}

// ---------------------------------------------------------------- categories

/** Each section's words, folded, longest first; replaced by one token per section for matching. */
const KIND_WORDS = (Object.entries(CATEGORY_KINDS) as [CategorySection, Record<string, readonly string[]>][])
  .flatMap(([section, words]) => Object.values(words).flat().map((w) => ({ section, word: clean(w) })))
  .sort((a, b) => b.word.length - a.word.length);
const kindToken = (section: CategorySection) => `kind${section}`;

/**
 * Country words that mean one country only, folded: "hrvatska" and "croatia" become one token.
 * Short codes ("hr") and shared ones ("ex yu", "balkan") stay as they are.
 */
const COUNTRY_WORDS = (() => {
  const count = new Map<string, number>();
  const lists = COUNTRIES.map((c) => [...new Set([...c.said, ...c.categories].map(clean).filter((w) => w.length > 3 && !w.includes(' ')))]);
  lists.forEach((l) => l.forEach((w) => count.set(w, (count.get(w) ?? 0) + 1)));
  return lists.flatMap((l, i) => l.filter((w) => count.get(w) === 1).map((word) => ({ word, token: `country${i}` })));
})();
const isKind = (word: string) => word.startsWith('kind');

/** "Filmovi 2026" and "EN | Movies 2026" both become "kindmovies 2026"; "Hrvatska" and "Croatia" one country token. */
function sameKinds(text: string): string {
  let out = ` ${clean(text)} `;
  for (const { section, word } of KIND_WORDS) out = out.split(` ${word} `).join(` ${kindToken(section)} `);
  for (const { word, token } of COUNTRY_WORDS) out = out.split(` ${word} `).join(` ${token} `);
  return out.trim().replace(/\s+/g, ' ');
}

/** The section named in what was said ("filmovi 2026" → movies), or null. */
export function saidSection(phrase: string): CategorySection | null {
  const words = sameKinds(phrase).split(' ');
  return (Object.keys(CATEGORY_KINDS) as CategorySection[]).find((s) => words.includes(kindToken(s))) ?? null;
}

/** Edits (insert, delete, change, swap) between two words, stopping above `max`. */
function editsWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let before: number[] = prev;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, before[j - 2] + 1);
      row.push(v);
    }
    if (Math.min(...row) > max) return false;
    before = prev;
    prev = row;
  }
  return prev[b.length] <= max;
}

/** Spellings close enough to be the same word ("horor" / "horror"); longer words may differ more. */
const nearlySame = (said: string, name: string) => said.length >= 5 && editsWithin(said, name, said.length >= 9 ? 2 : 1);

/** Lowest score of a category whose words were all found (some only roughly). */
const FOUND_ALL = 0.75;

/**
 * 0…1: how well a category name fits what was said, read from the playlist's own category names.
 * Kind words count alike in every language and, when the name has none, only choose the section
 * ("horror movies" → the movie category "Horror"). Every other word said must be in the name,
 * spelled about the same ("horor" ~ "Horror", "exyu" ~ "EX-YU", "hrvatska" ~ "Croatia").
 */
export function categoryScore(phrase: string, name: string): number {
  const n = sameKinds(name);
  const nameWords = n.split(' ');
  const nameCompact = n.replace(/ /g, '');
  const words = sameKinds(phrase)
    .split(' ')
    .filter((w) => w && !(isKind(w) && !nameWords.includes(w)));
  if (!words.length) return 0;
  const inName = (w: string) =>
    nameWords.some((nw) => nw === w || (w.length >= 4 && nw.startsWith(w)) || nearlySame(w, nw)) || (w.length >= 4 && nameCompact.includes(w));
  if (!words.every(inName)) return 0;
  return Math.max(titleScore(words.join(' '), n), FOUND_ALL);
}

// ---------------------------------------------------------------- sound

/** Spelling → rough sound, applied in order (English and Croatian spellings of the same sounds). */
const SOUNDS: readonly [RegExp, string][] = [
  [/ph/g, 'f'],
  [/ck/g, 'k'],
  [/qu/g, 'kv'],
  [/[qc]/g, 'k'],
  [/x/g, 'ks'],
  [/w/g, 'v'],
  [/z/g, 's'],
  [/[yj]/g, 'i'],
  [/h/g, ''],
];

/** Language / quality tags providers put around names ("EN - …", "[DE] …", "… 4K", "… (Multi-Sub)"). */
const NAME_PREFIX = /^\s*(?:\[[^\]]{1,8}\]\s*|\([^)]{1,8}\)\s*|[A-Z0-9]{2,4}\s*[|:]\s*|[A-Z0-9]{2,4}\s+[-–]\s+)+/;
const NAME_SUFFIX = /\s*(?:[([][^)\]]*[)\]]|\b(?:hd|fhd|uhd|sd|4k|hdr|multi\s*sub|sub|dub|sinkronizirano|titlovano)\b)\s*$/i;

/** A catalog name as people say it: "EN - WALL·E (2008) 4K" → "WALL·E". */
export function bareTitle(name: string): string {
  let title = splitTitle(name.replace(NAME_PREFIX, '')).title;
  for (let i = 0; i < 4; i++) {
    const next = splitTitle(title.replace(NAME_SUFFIX, '')).title;
    if (next === title) break;
    title = next;
  }
  return title.trim() || name;
}

/**
 * A rough sound key: consonants only, sound-alike letters merged, doubles collapsed. "WALL·E",
 * "volley" and "voli" all become "vl", which is how speech recognition mishears a title.
 */
export function soundKey(text: string): string {
  let s = clean(text).replace(/ /g, '');
  for (const [from, to] of SOUNDS) s = s.replace(from, to);
  s = s.replace(/(.)\1+/g, '$1');
  const first = /^[aeiou]/.test(s) ? 'a' : '';
  return first + s.replace(/[aeiou]/g, '');
}

/**
 * 0…0.75: what was heard sounds like the catalog `name` ("voli" ~ "EN - WALL·E (2008)"). Above a
 * loose spelling match, below a sure one: sound-alikes are offered to pick from, never played on
 * their own.
 */
export function soundScore(said: string, name: string): number {
  const bare = bareTitle(name);
  const a = soundKey(said);
  const b = soundKey(bare);
  if (a.length < 2 || !b) return 0;
  const words = (t: string) => clean(t).split(' ').filter(Boolean).length;
  if (Math.abs(words(said) - words(bare)) > 1) return 0;
  if (a === b) return 0.75;
  return a.length >= 4 && editsWithin(a, b, 1) ? 0.7 : 0;
}
