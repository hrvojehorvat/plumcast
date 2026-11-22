import { createBreather } from '../core/breathe';
import { canReplay, DAY_MS } from '../core/catchup';
import {
  categoryMatches,
  categoryScore,
  channelKey,
  channelScore,
  countryWords,
  isSure,
  MIN_TITLE_SCORE,
  rankByName,
  rankProgrammes,
  saidSection,
  sameTitle,
  searchVariants,
  bareTitle,
  soundMatch,
  soundOf,
  type Sound,
  titleScore,
  whenWindow,
  withoutCountry,
  type Ranked,
  type TimeWindow,
} from '../core/plumMatch';
import type { Lang } from '../core/i18n';
import type { PlayCommand } from '../core/voice';
import type { CategorySection } from '../core/voiceWords';
import { channelArchive } from './catchup';
import { ALL, channelByNumber, FAVORITES, listChannels, listLiveCategories, RECENT, searchProgrammes, type AiredItem, type Channel } from './live';
import { getMovie, listMovieCategories, listMovies, movieNames, type MovieItem } from './movies';
import type { Playlist } from './playlists';
import { getSeries, listSeries, listSeriesCategories, seriesNames, type SeriesItem } from './series';

/**
 * Plum: finds what a parsed "play …" command means in the stored catalog and guide. Reads only
 * SQLite (no server requests); checking that a replay really exists is left to `findReplay`
 * when it's played.
 */

export type PlumTarget =
  /** `fromGuide`: found as the programme on now, not by the channel's name. */
  | { kind: 'live'; channel: Channel; fromGuide?: boolean }
  | { kind: 'catchup'; channel: Channel; programme: AiredItem['programme'] }
  | { kind: 'movie'; movie: MovieItem }
  | { kind: 'series'; series: SeriesItem; season: number | null; episode: number | null }
  /** A category of Live TV, Movies or Series ("filmovi 2026"): opens it like the menu would. */
  | { kind: 'category'; section: CategorySection; id: string; name: string; count: number };

export interface Resolution {
  /** What to play; null when nothing fits. */
  best: PlumTarget | null;
  /** Best first, at most `MAX_CANDIDATES` (includes `best`), for "did you mean". */
  candidates: PlumTarget[];
  /** false: show the candidates instead of playing `best` right away. */
  sure: boolean;
}

export interface ResolveOptions {
  /** The user's guide time correction (Settings), like the guide screens use. */
  offsetHours: number;
  /** App language: its country's categories are searched for catch-up first. */
  lang?: Lang;
  now?: number;
  /** Stops the search: no further queries or archive downloads start, and it throws `PlumCancelled`. */
  signal?: AbortSignal;
  /** What is found so far, while slower parts (TV guide, archives) still run; never `sure`. */
  onUpdate?: (found: Resolution) => void;
}

/** The search was replaced by a newer one or Plum closed. */
export class PlumCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/** Throws when the search was stopped; called between steps. */
function check(options: ResolveOptions) {
  if (options.signal?.aborted) throw new PlumCancelled();
}

/** Shows what was found so far (only when there is something and the search still runs). */
function partial(options: ResolveOptions, ranked: Ranked<PlumTarget>[]) {
  if (!options.onUpdate || options.signal?.aborted || !ranked.length) return;
  options.onUpdate({ ...finish(ranked), sure: false });
}

const MAX_CANDIDATES = 20;
/** Rows per query; all spellings share one query now, so a little more. */
const PER_QUERY = 100;
/** A bare "play X" also looks this far back for replays. */
const BACK_MS = 7 * DAY_MS;

/** Channels whose provider archive Plum asks (one request each), how many at once, and how long in all. */
const ARCHIVE_CHANNELS = 80;
const ARCHIVE_PARALLEL = 8;
const ARCHIVE_WAIT_MS = 25_000;
/** Country categories whose catch-up channels are all asked. */
const ARCHIVE_CATEGORIES = 8;
/** Dev builds: which channels were asked and what came back, in the console. */
const trace = (...args: unknown[]) => {
  if (__DEV__) console.info('[plum]', ...args);
};
/** How far the guide is searched to learn which channels air a show (its past may be missing). */
const AIRS_BACK_MS = 8 * DAY_MS;
const AIRS_AHEAD_MS = 14 * DAY_MS;

const NOTHING: Resolution = { best: null, candidates: [], sure: false };

/** Same thing to play: same channel, same programme, same movie or series. */
function sameTarget(a: PlumTarget, b: PlumTarget): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'live':
      return a.channel.id === (b as typeof a).channel.id;
    case 'catchup': {
      // The same airing: same start on the same channel (its HD / SD copies count as one).
      const o = b as typeof a;
      return a.programme.start === o.programme.start && sameTitle(a.programme.title, o.programme.title) && channelKey(a.channel.name) === channelKey(o.channel.name);
    }
    case 'movie':
      return a.movie.id === (b as typeof a).movie.id;
    case 'series':
      return a.series.id === (b as typeof a).series.id;
    case 'category':
      return a.section === (b as typeof a).section && a.id === (b as typeof a).id;
  }
}

function finish(ranked: Ranked<PlumTarget>[]): Resolution {
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  // Each airing stays (several days or channels are the choice to make); copies of one go.
  const unique: Ranked<PlumTarget>[] = [];
  for (const r of sorted) if (!unique.some((u) => sameTarget(u.item, r.item))) unique.push(r);
  if (!unique.length) return NOTHING;
  // Programmes from the guide play at once only when there is just one airing; else the user picks.
  // A category is always shown first, never opened on its own.
  const airings = unique.filter((r) => r.item.kind === 'catchup' || (r.item.kind === 'live' && r.item.fromGuide)).length;
  const hasCategory = unique.some((r) => r.item.kind === 'category');
  const sure = airings > 1 || hasCategory ? false : isSure(unique, sameTarget);
  return { best: unique[0].item, candidates: unique.slice(0, MAX_CANDIDATES).map((r) => r.item), sure };
}

// ---- lookups (each runs every spoken variant and merges)

async function findChannels(playlistId: number, said: string): Promise<Ranked<Channel>[]> {
  if (/^\d{1,5}$/.test(said)) {
    const channel = await channelByNumber(playlistId, Number(said));
    return channel ? [{ item: channel, score: 1 }] : [];
  }
  // All spellings in one scan.
  const list = await listChannels(playlistId, ALL, searchVariants(said), false, PER_QUERY);
  return rankByName(list, said, (c) => c.name, channelScore);
}

async function findProgrammes(playlistId: number, said: string, window: TimeWindow, shift: number): Promise<AiredItem[]> {
  // All spellings in one scan of the guide (the biggest table).
  const list = await searchProgrammes(playlistId, searchVariants(said), window.from - shift, window.to - shift, window.around - shift, PER_QUERY, true);
  const byKey = new Map<string, AiredItem>();
  for (const a of list) {
    byKey.set(`${a.channel.id}|${a.programme.start}`, { ...a, programme: { ...a.programme, start: a.programme.start + shift, end: a.programme.end + shift } });
  }
  return [...byKey.values()];
}

/** Airings in the country that was said (or the app language's) come before other countries'. */
const COUNTRY_BONUS = 0.1;

/** Ended and replayable, or on now (played live). */
const watchable = (a: AiredItem, now: number) => canReplay(a.channel, a.programme, now) || (a.programme.start <= now && now < a.programme.end);

function programmeTarget(a: AiredItem, now: number): PlumTarget {
  return a.programme.start <= now && now < a.programme.end ? { kind: 'live', channel: a.channel, fromGuide: true } : { kind: 'catchup', channel: a.channel, programme: a.programme };
}

/** Runs `task` for each item, `parallel` at a time; stops starting new ones after `waitMs` and returns what finished. */
async function eachLimited<T, R>(items: readonly T[], parallel: number, waitMs: number, task: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = [];
  const deadline = Date.now() + waitMs;
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline && !signal?.aborted) {
      const item = items[next++];
      try {
        out.push(await task(item));
      } catch {
        // One channel failing doesn't stop the others.
      }
    }
  };
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  await Promise.race([Promise.all(Array.from({ length: parallel }, worker)), timeout]);
  return out;
}

/** Found in a provider's archive, and the categories of the country that was asked for. */
interface ArchiveFind {
  items: AiredItem[];
  /** Categories of the country said (or the app language's): their airings rank first. */
  countryCategories: Set<string>;
}

/**
 * Catch-up the way the Catch-up screen finds it: the provider's own archive per channel. The
 * stored guide often lacks the past of many channels, so this asks the likely ones, in order:
 * the channel that was said; the catch-up channels of the country's categories (said, else the
 * app language's); channels the guide shows airing the title; favourites and recents. One copy
 * per channel (HD / SD copies share an archive), the ones the provider says it records first.
 */
async function fromArchives(playlist: Playlist, cmd: PlayCommand, countryText: string, window: TimeWindow, options: ResolveOptions, now: number): Promise<ArchiveFind> {
  const id = playlist.id;
  const shift = options.offsetHours * 3_600_000;
  const [airing, said, favorites, recent, allCategories] = await Promise.all([
    findProgrammes(id, cmd.title, { from: now - AIRS_BACK_MS, to: now + AIRS_AHEAD_MS, around: now }, shift),
    cmd.channel ? findChannels(id, cmd.channel) : Promise.resolve([]),
    listChannels(id, FAVORITES, '', true, ARCHIVE_CHANNELS).catch(() => []),
    listChannels(id, RECENT, '', true, ARCHIVE_CHANNELS).catch(() => []),
    listLiveCategories(id).catch(() => []),
  ]);

  // The country's categories: full names ("Croatia", "Hrvatska") before short codes ("HR …").
  const words = countryWords(countryText, options.lang ?? null);
  const country = [...new Set(words.flatMap((w) => allCategories.filter((c) => categoryMatches(c.name, [w])).map((c) => c.id)))];
  const categories = country.slice(0, ARCHIVE_CATEGORIES);
  trace('catch-up categories', categories.map((c) => allCategories.find((x) => x.id === c)?.name ?? c));

  const byKey = new Map<string, Channel>();
  const add = (c: Channel) => {
    const key = channelKey(c.name);
    if (byKey.size >= ARCHIVE_CHANNELS || byKey.has(key)) return;
    byKey.set(key, c);
  };
  const recordedFirst = (list: Channel[]) => [...list].sort((a, b) => Number(b.archive) - Number(a.archive));
  said.filter((r) => r.score >= 0.7).slice(0, 2).forEach((r) => add(r.item));
  for (const category of categories) {
    if (byKey.size >= ARCHIVE_CHANNELS) break;
    recordedFirst(await listChannels(id, category, '', true).catch(() => [])).forEach(add);
  }
  rankProgrammes(airing, cmd.title, cmd.channel, now).forEach((r) => add(r.item.channel));
  favorites.forEach(add);
  recent.forEach(add);

  const channels = [...byKey.values()];
  trace(`asking ${channels.length} archives for "${cmd.title}"`, channels.map((c) => c.name));
  check(options);
  const lists = await eachLimited(channels, ARCHIVE_PARALLEL, ARCHIVE_WAIT_MS, async (channel) => {
    const programmes = await channelArchive(playlist, channel, options.offsetHours, now);
    const inWindow = programmes.filter((p) => p.end > window.from && p.start < window.to);
    const matching = inWindow.filter((p) => titleScore(cmd.title, p.title) >= MIN_TITLE_SCORE);
    trace(`${channel.name}: ${programmes.length} in archive, ${inWindow.length} in window, ${matching.length} match`, matching.map((p) => p.title));
    return inWindow.map((p) => ({ channel, programme: { start: p.start, end: p.end, title: p.title, description: p.description } }));
  }, options.signal);
  check(options);
  trace(`${lists.length} of ${channels.length} archives answered in time`);
  return { items: lists.flat(), countryCategories: new Set(country) };
}

/** "Play RTL from yesterday": no programme named, so the channel's replays in that window (its archive). */
async function channelReplays(playlist: Playlist, channel: Channel, window: TimeWindow, options: ResolveOptions, now: number): Promise<Ranked<PlumTarget>[]> {
  const list = await channelArchive(playlist, channel, options.offsetHours, now).catch(() => []);
  return list
    .filter((p) => p.end > window.from && p.start < window.to)
    .map((p) => ({ item: { kind: 'catchup' as const, channel, programme: p }, score: 0.7 - Math.abs(p.start - window.around) / DAY_MS }));
}

/** Below this a category name isn't the one meant. */
const CATEGORY_SCORE = 0.7;
/** A programme or movie with the same fit comes before a category. */
const CATEGORY_PENALTY = 0.02;

/** Categories of Live TV, Movies and Series whose names fit; only `section`'s when one was said. */
async function findCategories(playlistId: number, phrase: string): Promise<Ranked<PlumTarget>[]> {
  const only = saidSection(phrase);
  const [live, movies, series] = await Promise.all([
    !only || only === 'live' ? listLiveCategories(playlistId).catch(() => []) : [],
    !only || only === 'movies' ? listMovieCategories(playlistId).catch(() => []) : [],
    !only || only === 'series' ? listSeriesCategories(playlistId).catch(() => []) : [],
  ]);
  const lists: [CategorySection, { id: string; name: string; count: number }[]][] = [['live', live], ['movies', movies], ['series', series]];
  const out: Ranked<PlumTarget>[] = [];
  for (const [section, list] of lists) {
    for (const c of list) {
      const score = categoryScore(phrase, c.name);
      if (score >= CATEGORY_SCORE && c.count > 0) out.push({ item: { kind: 'category', section, id: c.id, name: c.name, count: c.count }, score: score - CATEGORY_PENALTY });
    }
  }
  return out;
}

// ---- sound-alikes ("play wall-e" heard as "volley")

interface SoundEntry {
  kind: 'movie' | 'series';
  id: string;
  name: string;
  /** The bare title's sound key and word count, so a search doesn't work them out again. */
  sound: Sound;
}
/** Sound keys of every movie and series name, built once per playlist sync, in memory. */
let soundIndex: { of: string; entries: Promise<SoundEntry[]> } | null = null;
/** Sound-alikes offered at most. */
const MAX_SOUND = 8;
/** Below this the normal search counts as not having found it. */
const WEAK_SCORE = 0.8;

/** Builds the keys in steps with breaks: 100k names at once would freeze a TV box for seconds. */
async function buildSoundEntries(playlistId: number): Promise<SoundEntry[]> {
  const [movies, series] = await Promise.all([movieNames(playlistId), seriesNames(playlistId)]);
  const breathe = createBreather();
  const out: SoundEntry[] = [];
  const add = async (kind: SoundEntry['kind'], list: { id: string; name: string }[]) => {
    for (const item of list) {
      out.push({ kind, id: item.id, name: item.name, sound: soundOf(bareTitle(item.name)) });
      if (out.length % 500 === 0) await breathe();
    }
  };
  await add('movie', movies);
  await add('series', series);
  return out;
}

function soundEntries(playlist: Playlist): Promise<SoundEntry[]> {
  const of = `${playlist.id}|${playlist.syncedAt ?? 0}`;
  if (soundIndex?.of !== of) {
    const entries = buildSoundEntries(playlist.id);
    soundIndex = { of, entries };
    entries.catch(() => {
      if (soundIndex?.of === of) soundIndex = null;
    });
  }
  return soundIndex.entries;
}

/**
 * Call when Plum opens: the sound-alike index is built while the user speaks, so the search
 * doesn't wait for it. Does nothing when it's already there.
 */
export function warmUpPlum(playlist: Playlist) {
  void soundEntries(playlist).catch(() => undefined);
}

/** Movies and series whose names sound like what was heard (offered, never played on their own). */
async function findBySound(playlist: Playlist, title: string, only: 'movie' | 'series' | null, options: ResolveOptions): Promise<Ranked<PlumTarget>[]> {
  const said = soundOf(title);
  if (said.key.length < 2) return [];
  const entries = await soundEntries(playlist);
  check(options);
  // Through every name in steps with breaks: the list on screen stays usable meanwhile.
  const breathe = createBreather();
  const found: { e: SoundEntry; score: number }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!only || e.kind === only) {
      const score = soundMatch(said, e.sound);
      if (score > 0) found.push({ e, score });
    }
    if (i % 2_000 === 0) {
      await breathe();
      check(options);
    }
  }
  const hits = found.sort((a, b) => b.score - a.score).slice(0, MAX_SOUND);
  trace(`sounds like "${title}" (${said.key})`, hits.map((h) => h.e.name));
  const items = await Promise.all(
    hits.map(async ({ e, score }): Promise<Ranked<PlumTarget> | null> => {
      if (e.kind === 'movie') {
        const movie = await getMovie(playlist.id, e.id);
        return movie ? { item: { kind: 'movie' as const, movie }, score } : null;
      }
      const series = await getSeries(playlist.id, e.id);
      return series ? { item: { kind: 'series' as const, series, season: null, episode: null }, score } : null;
    }),
  );
  return items.filter((r): r is Ranked<PlumTarget> => r !== null);
}

/**
 * Adds movies and series that sound like what was heard when none matched strongly by spelling
 * (programmes or channels that did match don't count: "volley" finds volleyball in the guide,
 * the user meant WALL·E). With sound-alikes in the list nothing plays at once.
 */
async function withSoundAlikes(playlist: Playlist, title: string, found: Ranked<PlumTarget>[], only: 'movie' | 'series' | null, options: ResolveOptions): Promise<Resolution> {
  const strong = found.some((r) => (r.item.kind === 'movie' || r.item.kind === 'series') && r.score >= WEAK_SCORE);
  if (!strong) partial(options, found);
  const sounds = strong ? [] : await findBySound(playlist, title, only, options).catch((error: unknown) => {
    if (error instanceof PlumCancelled) throw error;
    return [];
  });
  check(options);
  const resolution = finish([...found, ...sounds]);
  return sounds.length ? { ...resolution, sure: false } : resolution;
}

// ---- the command

const asMovies = (list: MovieItem[], title: string): Ranked<PlumTarget>[] =>
  rankByName(list, title, (m) => m.name).map((r) => ({ item: { kind: 'movie' as const, movie: r.item }, score: r.score }));
const asSeries = (list: SeriesItem[], title: string, season: number | null = null, episode: number | null = null): Ranked<PlumTarget>[] =>
  rankByName(list, title, (s) => s.name).map((r) => ({ item: { kind: 'series' as const, series: r.item, season, episode }, score: r.score }));

/**
 * What a parsed "play …" means. Quick parts first (categories, movies, series, channels), reported
 * through `onUpdate`; slow ones (TV guide, providers' archives) after, and only when the request
 * can mean them: "horror movies" never scans the guide.
 */
export async function resolvePlay(playlist: Playlist, cmd: PlayCommand, options: ResolveOptions): Promise<Resolution> {
  const now = options.now ?? Date.now();
  const shift = options.offsetHours * 3_600_000;
  const id = playlist.id;
  const title = cmd.title;
  const variants = searchVariants(title);

  if (cmd.prefer === 'category') return finish(await findCategories(id, cmd.phrase));
  // "Film 2026" said like a kind: its categories count too.
  const categories = cmd.prefer === 'catchup' ? [] : await findCategories(id, cmd.phrase);
  check(options);

  if (cmd.prefer === 'live') {
    const channels = await findChannels(id, title);
    return finish([...channels.map((r) => ({ item: { kind: 'live' as const, channel: r.item }, score: r.score })), ...categories]);
  }
  if (cmd.prefer === 'movie') {
    const found = asMovies(await listMovies(id, ALL, variants, 'az', PER_QUERY), title);
    check(options);
    return withSoundAlikes(playlist, title, [...found, ...categories], 'movie', options);
  }
  if (cmd.prefer === 'series') {
    const found = asSeries(await listSeries(id, ALL, variants, 'az', PER_QUERY), title, cmd.season, cmd.episode);
    check(options);
    return withSoundAlikes(playlist, title, [...found, ...categories], 'series', options);
  }

  const window: TimeWindow = cmd.when ? whenWindow(cmd.when, now) : { from: now - BACK_MS, to: now + 60_000, around: now };

  if (cmd.prefer === 'catchup') {
    // "masterchef croatia": search "masterchef", look in Croatia first.
    const looking = { ...cmd, title: withoutCountry(title) };
    const seen = new Set<string>();
    const hits: AiredItem[] = [];
    const take = (list: AiredItem[]) => {
      for (const a of list) {
        const key = `${a.channel.id}|${a.programme.start}`;
        if (!seen.has(key) && watchable(a, now)) {
          seen.add(key);
          hits.push(a);
        }
      }
    };
    let countryCategories = new Set<string>();
    const ranked = () => {
      const inCountry = (c: Channel) => (c.categoryId && countryCategories.has(c.categoryId) ? COUNTRY_BONUS : 0);
      return rankProgrammes(hits, looking.title, cmd.channel, window.around).map((r) => ({ item: programmeTarget(r.item, now), score: r.score + inCountry(r.item.channel) }));
    };
    // The stored guide answers first (shown at once); the providers' archives take longer.
    const archives = fromArchives(playlist, looking, `${title} ${cmd.channel ?? ''}`, window, options, now);
    archives.catch(() => undefined);
    take(await findProgrammes(id, looking.title, window, shift));
    check(options);
    partial(options, ranked());
    const found = await archives;
    countryCategories = found.countryCategories;
    take(found.items);
    const all = ranked();
    if (all.length) return finish(all);
    // Nothing by that title: maybe it was a channel ("RTL from yesterday").
    const [channel] = await findChannels(id, cmd.channel ?? title);
    check(options);
    if (channel && channel.score >= 0.85) return { ...finish(await channelReplays(playlist, channel.item, window, options, now)), sure: false };
    return NOTHING;
  }

  // A plain "play X". A kind said ("horror movies", "serije netflix", "kanali sport") limits it to
  // that section; otherwise channels, movies and series first, then the TV guide (the slow part).
  const section = saidSection(cmd.phrase);
  const all: Ranked<PlumTarget>[] = [...categories];
  const wants = (s: 'live' | 'movies' | 'series') => !section || section === s;
  const [channels, movies, series] = await Promise.all([
    wants('live') ? findChannels(id, title) : [],
    wants('movies') ? listMovies(id, ALL, variants, 'az', PER_QUERY) : [],
    wants('series') ? listSeries(id, ALL, variants, 'az', PER_QUERY) : [],
  ]);
  check(options);
  for (const r of channels) if (r.score >= 0.85) all.push({ item: { kind: 'live', channel: r.item }, score: r.score + 0.1 });
  all.push(...asMovies(movies, title), ...asSeries(series, title));

  if (!section) {
    partial(options, all);
    const programmes = await findProgrammes(id, title, window, shift);
    check(options);
    for (const r of rankProgrammes(programmes.filter((a) => watchable(a, now)), title, cmd.channel, now)) {
      const target = programmeTarget(r.item, now);
      // On now beats a replay of the same programme.
      all.push({ item: target, score: target.kind === 'live' ? r.score + 0.05 : r.score - 0.05 });
    }
  }
  const soundsLike = section === 'movies' ? 'movie' : section === 'series' ? 'series' : null;
  if (section === 'live') return finish(all);
  return withSoundAlikes(playlist, title, all, soundsLike, options);
}
