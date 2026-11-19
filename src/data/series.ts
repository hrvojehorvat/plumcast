import { useSyncExternalStore } from 'react';
import { likeContains } from '../core/search';
import type { Episode, EpisodeProgress } from '../core/series';
import type { StoredEpisode } from '../core/models';
import { getDb } from './db';
import { ALL, FAVORITES } from './live';
import { CONTINUE } from './movies';

export { ALL, CONTINUE, FAVORITES };

export type SeriesSort = 'recent' | 'az' | 'rating';

export interface SeriesCategory {
  id: string;
  name: string;
  count: number;
}

/** Where the user is in a series: the last episode played. */
export interface SeriesProgress {
  episodeId: string;
  season: number;
  episode: number;
  /** The last episode was watched to the end and there is nothing after it. */
  finished: boolean;
}

export interface SeriesItem {
  id: string;
  name: string;
  cover: string | null;
  categoryId: string | null;
  rating: number | null;
  plot: string | null;
  year: number | null;
  updatedAt: number | null;
  favorite: boolean;
  progress: SeriesProgress | null;
}

interface SeriesRow {
  id: string;
  name: string;
  cover: string | null;
  category_id: string | null;
  rating: number | null;
  plot: string | null;
  year: number | null;
  updated_at: number | null;
  fav: number;
  episode_id: string | null;
  season: number | null;
  episode: number | null;
  finished: number | null;
}

const toSeries = (r: SeriesRow): SeriesItem => ({
  id: r.id,
  name: r.name,
  cover: r.cover,
  categoryId: r.category_id,
  rating: r.rating,
  plot: r.plot,
  year: r.year,
  updatedAt: r.updated_at,
  favorite: r.fav === 1,
  progress: r.episode_id === null ? null : { episodeId: r.episode_id, season: r.season ?? 0, episode: r.episode ?? 0, finished: r.finished === 1 },
});

// ---- change notifications: lists and pages re-query after favourites / progress change ----

let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useSeriesVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

const COLUMNS = `s.id, s.name, s.cover, s.category_id, s.rating, s.plot, s.year, s.updated_at,
  (f.item_id IS NOT NULL) AS fav, sp.episode_id, sp.season, sp.episode, sp.finished`;
const JOINS = `LEFT JOIN favorites f ON f.playlist_id = s.playlist_id AND f.kind = 'series' AND f.item_id = s.id
  LEFT JOIN series_progress sp ON sp.playlist_id = s.playlist_id AND sp.series_id = s.id`;
const ORDER: Record<SeriesSort, string> = {
  recent: 's.updated_at IS NULL, s.updated_at DESC, s.sort',
  az: 's.search, s.sort',
  rating: 's.rating IS NULL, s.rating DESC, s.sort',
};

export async function listSeriesCategories(playlistId: number): Promise<SeriesCategory[]> {
  const db = await getDb();
  return db.getAllAsync<SeriesCategory>(
    `SELECT c.id, c.name, COALESCE(n.count, 0) AS count
       FROM categories c
       LEFT JOIN (SELECT category_id, COUNT(*) AS count FROM series WHERE playlist_id = ? GROUP BY category_id) n ON n.category_id = c.id
      WHERE c.playlist_id = ? AND c.kind = 'series'
      ORDER BY c.sort`,
    playlistId, playlistId,
  );
}

export async function countSeriesLists(playlistId: number): Promise<{ favorites: number; continuing: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ favorites: number; continuing: number }>(
    `SELECT (SELECT COUNT(*) FROM favorites f JOIN series s ON s.playlist_id = f.playlist_id AND s.id = f.item_id WHERE f.playlist_id = ? AND f.kind = 'series') AS favorites,
            (SELECT COUNT(*) FROM series_progress sp JOIN series s ON s.playlist_id = sp.playlist_id AND s.id = sp.series_id WHERE sp.playlist_id = ? AND sp.finished = 0) AS continuing`,
    playlistId, playlistId,
  );
  return row ?? { favorites: 0, continuing: 0 };
}

/** Series of one category (or a built-in list), optionally filtered by a search text inside it. */
export async function listSeries(playlistId: number, categoryId: string, query = '', sort: SeriesSort = 'recent'): Promise<SeriesItem[]> {
  const db = await getDb();
  const params: (string | number)[] = [playlistId];
  let where = 's.playlist_id = ?';
  let order = ORDER[sort];
  if (categoryId === FAVORITES) where += ' AND f.item_id IS NOT NULL';
  else if (categoryId === CONTINUE) {
    where += ' AND sp.finished = 0';
    order = 'sp.updated_at DESC';
  } else if (categoryId !== ALL) {
    where += ' AND s.category_id = ?';
    params.push(categoryId);
  }
  if (query.trim()) {
    where += ` AND s.search LIKE ? ESCAPE '\\'`;
    params.push(likeContains(query));
  }
  const rows = await db.getAllAsync<SeriesRow>(`SELECT ${COLUMNS} FROM series s ${JOINS} WHERE ${where} ORDER BY ${order}`, ...params);
  return rows.map(toSeries);
}

export async function getSeries(playlistId: number, id: string): Promise<SeriesItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SeriesRow>(`SELECT ${COLUMNS} FROM series s ${JOINS} WHERE s.playlist_id = ? AND s.id = ?`, playlistId, id);
  return row ? toSeries(row) : null;
}

/** Episodes of an M3U series (stored at sync time; Xtream loads them per series). */
export async function listStoredEpisodes(playlistId: number, seriesId: string): Promise<StoredEpisode[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; season: number; number: number; title: string | null; url: string; image: string | null }>(
    'SELECT id, season, number, title, url, image FROM episodes WHERE playlist_id = ? AND series_id = ? ORDER BY sort',
    playlistId, seriesId,
  );
  return rows.map((r) => ({ seriesId, ...r }));
}

export async function setSeriesFavorite(playlistId: number, id: string, favorite: boolean, now = Date.now()) {
  const db = await getDb();
  if (favorite) await db.runAsync(`INSERT OR IGNORE INTO favorites (playlist_id, kind, item_id, added_at) VALUES (?, 'series', ?, ?)`, playlistId, id, now);
  else await db.runAsync(`DELETE FROM favorites WHERE playlist_id = ? AND kind = 'series' AND item_id = ?`, playlistId, id);
  changed();
}

/** Saved positions of these episodes. */
export async function getEpisodeProgress(playlistId: number, episodeIds: readonly string[]): Promise<Map<string, EpisodeProgress>> {
  const db = await getDb();
  const out = new Map<string, EpisodeProgress>();
  for (let i = 0; i < episodeIds.length; i += 500) {
    const chunk = episodeIds.slice(i, i + 500);
    const rows = await db.getAllAsync<{ item_id: string; position_ms: number; duration_ms: number | null; watched: number }>(
      `SELECT item_id, position_ms, duration_ms, watched FROM progress WHERE playlist_id = ? AND kind = 'episode' AND item_id IN (${chunk.map(() => '?').join(',')})`,
      playlistId, ...chunk,
    );
    for (const r of rows) out.set(r.item_id, { positionMs: r.position_ms, durationMs: r.duration_ms, watched: r.watched === 1 });
  }
  return out;
}

async function touchSeries(playlistId: number, seriesId: string, episode: Pick<Episode, 'id' | 'season' | 'number'>, finished: boolean, now: number) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO series_progress (playlist_id, series_id, episode_id, season, episode, finished, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(playlist_id, series_id) DO UPDATE SET episode_id = excluded.episode_id, season = excluded.season,
       episode = excluded.episode, finished = excluded.finished, updated_at = excluded.updated_at`,
    playlistId, seriesId, episode.id, episode.season, episode.number, finished ? 1 : 0, now,
  );
}

/**
 * Remembers where playback of an episode is, and that it is the series' last one played.
 * `finished`: this episode is done and it is the last one (the series leaves Continue watching).
 */
export async function saveEpisodeProgress(
  playlistId: number,
  seriesId: string,
  episode: Pick<Episode, 'id' | 'season' | 'number'>,
  positionMs: number,
  durationMs: number | null,
  watched: boolean,
  finished: boolean,
  notify = false,
  now = Date.now(),
) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO progress (playlist_id, kind, item_id, position_ms, duration_ms, watched, updated_at) VALUES (?, 'episode', ?, ?, ?, ?, ?)
     ON CONFLICT(playlist_id, kind, item_id) DO UPDATE SET position_ms = excluded.position_ms,
       duration_ms = COALESCE(excluded.duration_ms, progress.duration_ms), watched = excluded.watched, updated_at = excluded.updated_at`,
    playlistId, episode.id, Math.round(positionMs), durationMs === null ? null : Math.round(durationMs), watched ? 1 : 0, now,
  );
  await touchSeries(playlistId, seriesId, episode, finished, now);
  if (notify) changed();
}

/** "Mark as watched" / "Mark as unwatched" for one episode (unwatched also forgets the position). */
export async function setEpisodeWatched(
  playlistId: number,
  seriesId: string,
  episode: Pick<Episode, 'id' | 'season' | 'number'>,
  watched: boolean,
  isLast: boolean,
  now = Date.now(),
) {
  const db = await getDb();
  if (watched) {
    await db.runAsync(
      `INSERT INTO progress (playlist_id, kind, item_id, position_ms, duration_ms, watched, updated_at) VALUES (?, 'episode', ?, 0, NULL, 1, ?)
       ON CONFLICT(playlist_id, kind, item_id) DO UPDATE SET watched = 1, updated_at = excluded.updated_at`,
      playlistId, episode.id, now,
    );
    await touchSeries(playlistId, seriesId, episode, isLast, now);
  } else {
    await db.runAsync(`DELETE FROM progress WHERE playlist_id = ? AND kind = 'episode' AND item_id = ?`, playlistId, episode.id);
  }
  changed();
}

