import { list, num, obj, str } from './coerce';
import type { StoredEpisode } from './models';
import { isFinished, names, parseDuration, parseYear, text, youtubeId } from './vod';
import type { XtreamLogin } from './xtream';

export interface Episode {
  id: string;
  season: number;
  number: number;
  /** Cleaned title; null when the provider only sends "Show - S01E01". */
  title: string | null;
  plot: string | null;
  durationMs: number | null;
  image: string | null;
  /** File extension for the Xtream link. */
  ext: string | null;
  /** Full link for M3U episodes; null for Xtream (built from the login). */
  url: string | null;
}

export interface Season {
  number: number;
  name: string | null;
  episodes: Episode[];
}

/** What `get_series_info` adds to a series. Every field is optional on real servers. */
export interface SeriesInfo {
  plot: string | null;
  cast: string | null;
  director: string | null;
  genre: string | null;
  year: number | null;
  rating: number | null;
  cover: string | null;
  backdrop: string | null;
  trailer: string | null;
  seasons: Season[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CODE = /\bS(\d{1,2})\s*[ .x-]?\s*E(\d{1,3})\b/i;

/** "S01 E02" / "S1E2" in a title, or null. */
export function episodeCode(title: string): { season: number; number: number } | null {
  const m = CODE.exec(title);
  return m ? { season: Number(m[1]), number: Number(m[2]) } : null;
}

/**
 * The episode's own title: "Senke Nad Balkanom - S01E01 -" → null, "Show - S01E02 - Pilot" →
 * "Pilot". Titles that are only the show name or a code count as no title.
 */
export function episodeTitle(raw: string | null | undefined, seriesName: string): string | null {
  let t = raw?.trim() ?? '';
  if (!t) return null;
  const name = seriesName.trim();
  if (name) t = t.replace(new RegExp(`^${escapeRe(name)}`, 'i'), '');
  t = t.replace(new RegExp(CODE.source, 'ig'), ' ').replace(/^[\s\-–|:.]+|[\s\-–|:.]+$/g, '').trim();
  if (!t || /^(episode|epizoda|folge|ep\.?)\s*\d+$/i.test(t) || t.toLowerCase() === name.toLowerCase()) return null;
  return t;
}

/** Seasons in order, with specials (season 0) last. */
const seasonOrder = (a: Season, b: Season) => (a.number === 0 ? 1 : 0) - (b.number === 0 ? 1 : 0) || a.number - b.number;

function parseEpisode(raw: unknown, groupSeason: number, seriesName: string): Episode | null {
  const e = obj(raw);
  const id = str(e.id);
  if (!id) return null;
  const info = obj(e.info);
  const title = str(e.title);
  const code = title ? episodeCode(title) : null;
  const number = num(e.episode_num) ?? code?.number ?? 0;
  return {
    id,
    season: num(e.season) ?? num(info.season) ?? code?.season ?? groupSeason,
    number,
    title: episodeTitle(title ?? text(info.name), seriesName),
    plot: text(info.plot) ?? text(info.overview),
    durationMs: parseDuration(info),
    image: text(info.movie_image) ?? text(info.cover_big),
    ext: text(e.container_extension),
    url: null,
  };
}

/**
 * Seasons come from the episodes themselves: the `seasons` list is often empty, or names a
 * "Specials" season that has no episodes. It only adds season names.
 */
export function parseSeriesInfo(json: unknown, seriesName: string): SeriesInfo {
  const root = obj(json);
  const info = obj(root.info);
  const seasonNames = new Map<number, string>();
  for (const s of list(root.seasons)) {
    const season = obj(s);
    const n = num(season.season_number);
    const name = text(season.name);
    if (n !== null && name) seasonNames.set(n, name);
  }

  const bySeason = new Map<number, Episode[]>();
  const groups = root.episodes;
  const entries: [number, unknown][] = Array.isArray(groups)
    ? groups.flatMap((g, i) => (Array.isArray(g) ? g.map((e) => [i + 1, e] as [number, unknown]) : [[0, g] as [number, unknown]]))
    : Object.entries(obj(groups)).flatMap(([key, eps]) => list(eps).map((e) => [num(key) ?? 0, e] as [number, unknown]));
  const seen = new Set<string>();
  for (const [group, raw] of entries) {
    const episode = parseEpisode(raw, group, seriesName);
    if (!episode || seen.has(episode.id)) continue;
    seen.add(episode.id);
    const eps = bySeason.get(episode.season) ?? [];
    eps.push(episode);
    bySeason.set(episode.season, eps);
  }

  const backdrops = list(info.backdrop_path).map(text).filter((s): s is string => s !== null);
  const rating = num(info.rating);
  return {
    plot: text(info.plot) ?? text(info.description),
    cast: names(info.cast) ?? names(info.actors),
    director: names(info.director),
    genre: text(info.genre),
    year: parseYear(info.releaseDate, info.release_date, info.releasedate, info.year),
    rating: rating !== null && rating > 0 ? Math.min(10, rating) : null,
    cover: text(info.cover) ?? text(info.cover_big),
    backdrop: backdrops[0] ?? text(info.backdrop_path),
    trailer: youtubeId(str(info.youtube_trailer) ?? str(info.trailer)),
    seasons: [...bySeason.entries()]
      .map(([number, episodes]) => ({ number, name: seasonNames.get(number) ?? null, episodes: episodes.sort((a, b) => a.number - b.number) }))
      .sort(seasonOrder),
  };
}

/** Seasons of an M3U series from the episodes stored at sync time. */
export function seasonsFromStored(stored: readonly StoredEpisode[]): Season[] {
  const bySeason = new Map<number, Episode[]>();
  for (const e of stored) {
    const eps = bySeason.get(e.season) ?? [];
    eps.push({ id: e.id, season: e.season, number: e.number, title: e.title, plot: null, durationMs: null, image: e.image, ext: null, url: e.url });
    bySeason.set(e.season, eps);
  }
  return [...bySeason.entries()]
    .map(([number, episodes]) => ({ number, name: null, episodes: episodes.sort((a, b) => a.number - b.number) }))
    .sort(seasonOrder);
}

/** Playable URL of an episode: the M3U entry URL, or built from the Xtream login. */
export function episodeStreamUrl(episode: Pick<Episode, 'id' | 'url' | 'ext'>, login: XtreamLogin | null): string | null {
  if (episode.url) return episode.url;
  if (!login) return null;
  const ext = (episode.ext ?? 'mp4').toLowerCase().replace(/^\./, '') || 'mp4';
  return `${login.server}/series/${encodeURIComponent(login.username)}/${encodeURIComponent(login.password)}/${encodeURIComponent(episode.id)}.${ext}`;
}

/** All episodes in watching order. */
export const allEpisodes = (seasons: readonly Season[]): Episode[] => seasons.flatMap((s) => s.episodes);

/** The episode after this one (into the next season), or null at the end. */
export function nextEpisode(seasons: readonly Season[], episodeId: string): Episode | null {
  const all = allEpisodes(seasons);
  const i = all.findIndex((e) => e.id === episodeId);
  return i >= 0 ? (all[i + 1] ?? null) : null;
}

export interface EpisodeProgress {
  positionMs: number;
  durationMs: number | null;
  watched: boolean;
}

/**
 * What "Play" starts: the last episode watched if it isn't finished (resume), else the one after
 * it, else the first episode. `resumeMs` is null when it starts from the beginning.
 */
export function pickEpisode(
  seasons: readonly Season[],
  lastEpisodeId: string | null,
  progress: ReadonlyMap<string, EpisodeProgress>,
): { episode: Episode; resumeMs: number | null } | null {
  const all = allEpisodes(seasons);
  if (!all.length) return null;
  const last = lastEpisodeId ? all.find((e) => e.id === lastEpisodeId) : undefined;
  if (last) {
    const p = progress.get(last.id);
    const done = !p || p.watched || isFinished(p.positionMs, p.durationMs ?? last.durationMs);
    if (!done) return { episode: last, resumeMs: p.positionMs >= 60_000 ? p.positionMs : null };
    const next = nextEpisode(seasons, last.id);
    if (next) return { episode: next, resumeMs: null };
  }
  const firstUnwatched = all.find((e) => !progress.get(e.id)?.watched);
  return { episode: firstUnwatched ?? all[0], resumeMs: null };
}

/** "S1 E3". */
export const episodeLabel = (e: Pick<Episode, 'season' | 'number'>) => `S${e.season} E${e.number}`;
