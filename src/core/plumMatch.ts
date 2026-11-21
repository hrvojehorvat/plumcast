import { foldSearch } from './search';
import type { When } from './voice';
import { PARTS_OF_DAY } from './voiceWords';

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
