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
import { listMovieCategories, listMovies, type MovieItem } from './movies';
import type { Playlist } from './playlists';
import { listSeries, listSeriesCategories, type SeriesItem } from './series';

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
}

const MAX_CANDIDATES = 20;
const PER_QUERY = 60;
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
  const lists = await Promise.all(searchVariants(said).map((q) => listChannels(playlistId, ALL, q, false, PER_QUERY)));
  const byId = new Map<string, Channel>();
  for (const c of lists.flat()) byId.set(c.id, c);
  return rankByName([...byId.values()], said, (c) => c.name, channelScore);
}

async function findProgrammes(playlistId: number, said: string, window: TimeWindow, shift: number): Promise<AiredItem[]> {
  const lists = await Promise.all(
    searchVariants(said).map((q) => searchProgrammes(playlistId, q, window.from - shift, window.to - shift, window.around - shift, PER_QUERY, true)),
  );
  const byKey = new Map<string, AiredItem>();
  for (const a of lists.flat()) {
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
async function eachLimited<T, R>(items: readonly T[], parallel: number, waitMs: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  const deadline = Date.now() + waitMs;
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) {
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
  const lists = await eachLimited(channels, ARCHIVE_PARALLEL, ARCHIVE_WAIT_MS, async (channel) => {
    const programmes = await channelArchive(playlist, channel, options.offsetHours, now);
    const inWindow = programmes.filter((p) => p.end > window.from && p.start < window.to);
    const matching = inWindow.filter((p) => titleScore(cmd.title, p.title) >= MIN_TITLE_SCORE);
    trace(`${channel.name}: ${programmes.length} in archive, ${inWindow.length} in window, ${matching.length} match`, matching.map((p) => p.title));
    return inWindow.map((p) => ({ channel, programme: { start: p.start, end: p.end, title: p.title, description: p.description } }));
  });
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

// ---- the command

export async function resolvePlay(playlist: Playlist, cmd: PlayCommand, options: ResolveOptions): Promise<Resolution> {
  const now = options.now ?? Date.now();
  const shift = options.offsetHours * 3_600_000;
  const id = playlist.id;
  const title = cmd.title;

  if (cmd.prefer === 'category') return finish(await findCategories(id, cmd.phrase));
  // "Film 2026" said like a kind: its categories count too.
  const categories = cmd.prefer === 'catchup' ? [] : await findCategories(id, cmd.phrase);

  if (cmd.prefer === 'live') {
    const channels = await findChannels(id, title);
    return finish([...channels.map((r) => ({ item: { kind: 'live' as const, channel: r.item }, score: r.score })), ...categories]);
  }
  if (cmd.prefer === 'movie') {
    const movies = await Promise.all(searchVariants(title).map((q) => listMovies(id, ALL, q, 'az', PER_QUERY)));
    return finish([...rankByName(movies.flat(), title, (m) => m.name).map((r) => ({ item: { kind: 'movie' as const, movie: r.item }, score: r.score })), ...categories]);
  }
  if (cmd.prefer === 'series') {
    const series = await Promise.all(searchVariants(title).map((q) => listSeries(id, ALL, q, 'az', PER_QUERY)));
    return finish([
      ...rankByName(series.flat(), title, (s) => s.name).map((r) => ({ item: { kind: 'series' as const, series: r.item, season: cmd.season, episode: cmd.episode }, score: r.score })),
      ...categories,
    ]);
  }

  const window: TimeWindow = cmd.when ? whenWindow(cmd.when, now) : { from: now - BACK_MS, to: now + 60_000, around: now };

  if (cmd.prefer === 'catchup') {
    // "masterchef croatia": search "masterchef", look in Croatia first.
    const looking = { ...cmd, title: withoutCountry(title) };
    // The stored guide and the providers' archives; ended ones replay, one on now ("… from today") plays live.
    const [guide, archives] = await Promise.all([
      findProgrammes(id, looking.title, window, shift),
      fromArchives(playlist, looking, `${title} ${cmd.channel ?? ''}`, window, options, now),
    ]);
    const seen = new Set<string>();
    const hits = [...archives.items, ...guide].filter((a) => {
      const key = `${a.channel.id}|${a.programme.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return watchable(a, now);
    });
    const inCountry = (c: Channel) => (c.categoryId && archives.countryCategories.has(c.categoryId) ? COUNTRY_BONUS : 0);
    const ranked = rankProgrammes(hits, looking.title, cmd.channel, window.around);
    if (ranked.length) {
      return finish(ranked.map((r) => ({ item: programmeTarget(r.item, now), score: r.score + inCountry(r.item.channel) })));
    }
    // Nothing by that title: maybe it was a channel ("RTL from yesterday").
    const [channel] = await findChannels(id, cmd.channel ?? title);
    if (channel && channel.score >= 0.85) return { ...finish(await channelReplays(playlist, channel.item, window, options, now)), sure: false };
    return NOTHING;
  }

  // A plain "play X": a channel, something on now, a movie or series, or the latest replay.
  const [channels, programmes, movies, series] = await Promise.all([
    findChannels(id, title),
    findProgrammes(id, title, window, shift),
    Promise.all(searchVariants(title).map((q) => listMovies(id, ALL, q, 'az', PER_QUERY))).then((l) => l.flat()),
    Promise.all(searchVariants(title).map((q) => listSeries(id, ALL, q, 'az', PER_QUERY))).then((l) => l.flat()),
  ]);
  const all: Ranked<PlumTarget>[] = [];
  for (const r of channels) if (r.score >= 0.85) all.push({ item: { kind: 'live', channel: r.item }, score: r.score + 0.1 });
  for (const r of rankProgrammes(programmes.filter((a) => watchable(a, now)), title, cmd.channel, now)) {
    const target = programmeTarget(r.item, now);
    // On now beats a replay of the same programme.
    all.push({ item: target, score: target.kind === 'live' ? r.score + 0.05 : r.score - 0.05 });
  }
  for (const r of rankByName(movies, title, (m) => m.name)) all.push({ item: { kind: 'movie', movie: r.item }, score: r.score });
  for (const r of rankByName(series, title, (s) => s.name)) all.push({ item: { kind: 'series', series: r.item, season: null, episode: null }, score: r.score });
  all.push(...categories);
  return finish(all);
}
