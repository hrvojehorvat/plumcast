import { canReplay, DAY_MS } from '../core/catchup';
import {
  channelScore,
  isSure,
  rankByName,
  rankProgrammes,
  sameTitle,
  searchVariants,
  whenWindow,
  type Ranked,
  type TimeWindow,
} from '../core/plumMatch';
import type { PlayCommand } from '../core/voice';
import { programmesByEpgId } from './guideDb';
import { ALL, channelByNumber, listChannels, searchProgrammes, type AiredItem, type Channel } from './live';
import { listMovies, type MovieItem } from './movies';
import type { Playlist } from './playlists';
import { listSeries, type SeriesItem } from './series';

/**
 * Plum: finds what a parsed "play …" command means in the stored catalog and guide. Reads only
 * SQLite (no server requests); checking that a replay really exists is left to `findReplay`
 * when it's played.
 */

export type PlumTarget =
  | { kind: 'live'; channel: Channel }
  | { kind: 'catchup'; channel: Channel; programme: AiredItem['programme'] }
  | { kind: 'movie'; movie: MovieItem }
  | { kind: 'series'; series: SeriesItem; season: number | null; episode: number | null };

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
  now?: number;
}

const MAX_CANDIDATES = 5;
const PER_QUERY = 40;
/** A bare "play X" also looks this far back for replays. */
const BACK_MS = 7 * DAY_MS;

const NOTHING: Resolution = { best: null, candidates: [], sure: false };

/** Same thing to play: same channel, same programme, same movie or series. */
function sameTarget(a: PlumTarget, b: PlumTarget): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'live':
      return a.channel.id === (b as typeof a).channel.id;
    case 'catchup':
      return sameTitle(a.programme.title, (b as typeof a).programme.title);
    case 'movie':
      return a.movie.id === (b as typeof a).movie.id;
    case 'series':
      return a.series.id === (b as typeof a).series.id;
  }
}

function finish(ranked: Ranked<PlumTarget>[]): Resolution {
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  const unique: Ranked<PlumTarget>[] = [];
  // Replays of one title on several days or channels all stay (that's the choice to make); other duplicates go.
  for (const r of sorted) if (r.item.kind === 'catchup' || !unique.some((u) => sameTarget(u.item, r.item))) unique.push(r);
  if (!unique.length) return NOTHING;
  return { best: unique[0].item, candidates: unique.slice(0, MAX_CANDIDATES).map((r) => r.item), sure: isSure(unique, sameTarget) };
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
    searchVariants(said).map((q) => searchProgrammes(playlistId, q, window.from - shift, window.to - shift, window.around - shift, PER_QUERY)),
  );
  const byKey = new Map<string, AiredItem>();
  for (const a of lists.flat()) {
    byKey.set(`${a.channel.id}|${a.programme.start}`, { ...a, programme: { ...a.programme, start: a.programme.start + shift, end: a.programme.end + shift } });
  }
  return [...byKey.values()];
}

/** Ended and replayable, or on now (played live). */
const watchable = (a: AiredItem, now: number) => canReplay(a.channel, a.programme, now) || (a.programme.start <= now && now < a.programme.end);

function programmeTarget(a: AiredItem, now: number): PlumTarget {
  return a.programme.start <= now && now < a.programme.end ? { kind: 'live', channel: a.channel } : { kind: 'catchup', channel: a.channel, programme: a.programme };
}

/** "Play RTL from yesterday": no programme named, so the channel's programmes in that window. */
async function channelProgrammes(playlist: Playlist, channel: Channel, window: TimeWindow, shift: number, now: number): Promise<Ranked<PlumTarget>[]> {
  if (!channel.epgId) return [];
  const list = await programmesByEpgId(playlist.id, channel.epgId, window.from - shift, window.to - shift);
  return list
    .map((p) => ({ ...p, start: p.start + shift, end: p.end + shift }))
    .filter((p) => canReplay(channel, p, now))
    .map((p) => ({ item: { kind: 'catchup' as const, channel, programme: p }, score: 0.7 - Math.abs(p.start - window.around) / DAY_MS }));
}

// ---- the command

export async function resolvePlay(playlist: Playlist, cmd: PlayCommand, options: ResolveOptions): Promise<Resolution> {
  const now = options.now ?? Date.now();
  const shift = options.offsetHours * 3_600_000;
  const id = playlist.id;
  const title = cmd.title;

  if (cmd.prefer === 'live') {
    const channels = await findChannels(id, title);
    return finish(channels.map((r) => ({ item: { kind: 'live', channel: r.item }, score: r.score })));
  }
  if (cmd.prefer === 'movie') {
    const movies = await Promise.all(searchVariants(title).map((q) => listMovies(id, ALL, q, 'az', PER_QUERY)));
    return finish(rankByName(movies.flat(), title, (m) => m.name).map((r) => ({ item: { kind: 'movie', movie: r.item }, score: r.score })));
  }
  if (cmd.prefer === 'series') {
    const series = await Promise.all(searchVariants(title).map((q) => listSeries(id, ALL, q, 'az', PER_QUERY)));
    return finish(
      rankByName(series.flat(), title, (s) => s.name).map((r) => ({ item: { kind: 'series', series: r.item, season: cmd.season, episode: cmd.episode }, score: r.score })),
    );
  }

  const window: TimeWindow = cmd.when ? whenWindow(cmd.when, now) : { from: now - BACK_MS, to: now + 60_000, around: now };

  if (cmd.prefer === 'catchup') {
    const hits = (await findProgrammes(id, title, window, shift)).filter((a) => canReplay(a.channel, a.programme, now));
    const ranked = rankProgrammes(hits, title, cmd.channel, window.around);
    if (ranked.length) return finish(ranked.map((r) => ({ item: programmeTarget(r.item, now), score: r.score })));
    // Nothing by that title: maybe it was a channel ("RTL from yesterday").
    const [channel] = await findChannels(id, cmd.channel ?? title);
    if (channel && channel.score >= 0.85) {
      const list = await channelProgrammes(playlist, channel.item, window, shift, now);
      return { ...finish(list), sure: false };
    }
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
  return finish(all);
}
