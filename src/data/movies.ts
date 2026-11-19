import { useSyncExternalStore } from 'react';
import { likeContains } from '../core/search';
import { getDb } from './db';
import { ALL, FAVORITES } from './live';

/** Built-in list of started, unfinished movies (newest first). */
export const CONTINUE = ':continue';
export { ALL, FAVORITES };

export type MovieSort = 'recent' | 'az' | 'rating';

export interface MovieCategory {
  id: string;
  name: string;
  count: number;
}

export interface MovieItem {
  id: string;
  name: string;
  logo: string | null;
  categoryId: string | null;
  ext: string | null;
  rating: number | null;
  addedAt: number | null;
  url: string | null;
  favorite: boolean;
  progress: MovieProgress | null;
}

export interface MovieProgress {
  positionMs: number;
  durationMs: number | null;
  watched: boolean;
}

interface MovieRow {
  id: string;
  name: string;
  logo: string | null;
  category_id: string | null;
  ext: string | null;
  rating: number | null;
  added_at: number | null;
  url: string | null;
  fav: number;
  position_ms: number | null;
  duration_ms: number | null;
  watched: number | null;
}

const toMovie = (r: MovieRow): MovieItem => ({
  id: r.id,
  name: r.name,
  logo: r.logo,
  categoryId: r.category_id,
  ext: r.ext,
  rating: r.rating,
  addedAt: r.added_at,
  url: r.url,
  favorite: r.fav === 1,
  progress: r.position_ms === null ? null : { positionMs: r.position_ms, durationMs: r.duration_ms, watched: r.watched === 1 },
});

// ---- change notifications: lists re-query after favourites / progress change ----

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
export function useMoviesVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

const COLUMNS = `m.id, m.name, m.logo, m.category_id, m.ext, m.rating, m.added_at, m.url,
  (f.item_id IS NOT NULL) AS fav, p.position_ms, p.duration_ms, p.watched`;
const JOINS = `LEFT JOIN favorites f ON f.playlist_id = m.playlist_id AND f.kind = 'movie' AND f.item_id = m.id
  LEFT JOIN progress p ON p.playlist_id = m.playlist_id AND p.kind = 'movie' AND p.item_id = m.id`;
const UNFINISHED = `p.watched = 0 AND p.position_ms >= 60000`;
const ORDER: Record<MovieSort, string> = {
  recent: 'm.added_at IS NULL, m.added_at DESC, m.sort',
  az: 'm.search, m.sort',
  rating: 'm.rating IS NULL, m.rating DESC, m.sort',
};

export async function listMovieCategories(playlistId: number): Promise<MovieCategory[]> {
  const db = await getDb();
  return db.getAllAsync<MovieCategory>(
    `SELECT c.id, c.name, COALESCE(n.count, 0) AS count
       FROM categories c
       LEFT JOIN (SELECT category_id, COUNT(*) AS count FROM movies WHERE playlist_id = ? GROUP BY category_id) n ON n.category_id = c.id
      WHERE c.playlist_id = ? AND c.kind = 'movie'
      ORDER BY c.sort`,
    playlistId, playlistId,
  );
}

export async function countMovieLists(playlistId: number): Promise<{ favorites: number; continuing: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ favorites: number; continuing: number }>(
    `SELECT (SELECT COUNT(*) FROM favorites f JOIN movies m ON m.playlist_id = f.playlist_id AND m.id = f.item_id WHERE f.playlist_id = ? AND f.kind = 'movie') AS favorites,
            (SELECT COUNT(*) FROM progress p JOIN movies m ON m.playlist_id = p.playlist_id AND m.id = p.item_id WHERE p.playlist_id = ? AND p.kind = 'movie' AND ${UNFINISHED}) AS continuing`,
    playlistId, playlistId,
  );
  return row ?? { favorites: 0, continuing: 0 };
}

/** Movies of one category (or a built-in list), optionally filtered by a search text inside it. */
export async function listMovies(playlistId: number, categoryId: string, query = '', sort: MovieSort = 'recent'): Promise<MovieItem[]> {
  const db = await getDb();
  const params: (string | number)[] = [playlistId];
  let where = 'm.playlist_id = ?';
  let order = ORDER[sort];
  if (categoryId === FAVORITES) where += ' AND f.item_id IS NOT NULL';
  else if (categoryId === CONTINUE) {
    where += ` AND ${UNFINISHED}`;
    order = 'p.updated_at DESC';
  } else if (categoryId !== ALL) {
    where += ' AND m.category_id = ?';
    params.push(categoryId);
  }
  if (query.trim()) {
    where += ` AND m.search LIKE ? ESCAPE '\\'`;
    params.push(likeContains(query));
  }
  const rows = await db.getAllAsync<MovieRow>(`SELECT ${COLUMNS} FROM movies m ${JOINS} WHERE ${where} ORDER BY ${order}`, ...params);
  return rows.map(toMovie);
}

export async function getMovie(playlistId: number, id: string): Promise<MovieItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<MovieRow>(`SELECT ${COLUMNS} FROM movies m ${JOINS} WHERE m.playlist_id = ? AND m.id = ?`, playlistId, id);
  return row ? toMovie(row) : null;
}

export async function setMovieFavorite(playlistId: number, id: string, favorite: boolean, now = Date.now()) {
  const db = await getDb();
  if (favorite) await db.runAsync(`INSERT OR IGNORE INTO favorites (playlist_id, kind, item_id, added_at) VALUES (?, 'movie', ?, ?)`, playlistId, id, now);
  else await db.runAsync(`DELETE FROM favorites WHERE playlist_id = ? AND kind = 'movie' AND item_id = ?`, playlistId, id);
  changed();
}

/**
 * Remembers where playback is. Called every few seconds while playing (quietly) and on close
 * (`notify`, so lists and the detail page show the new position).
 */
export async function saveProgress(playlistId: number, id: string, positionMs: number, durationMs: number | null, watched: boolean, notify = false, now = Date.now()) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO progress (playlist_id, kind, item_id, position_ms, duration_ms, watched, updated_at) VALUES (?, 'movie', ?, ?, ?, ?, ?)
     ON CONFLICT(playlist_id, kind, item_id) DO UPDATE SET position_ms = excluded.position_ms,
       duration_ms = COALESCE(excluded.duration_ms, progress.duration_ms), watched = excluded.watched, updated_at = excluded.updated_at`,
    playlistId, id, Math.round(positionMs), durationMs === null ? null : Math.round(durationMs), watched ? 1 : 0, now,
  );
  if (notify) changed();
}

/** "Mark as watched" / "Mark as unwatched" (unwatched also forgets the position). */
export async function setWatched(playlistId: number, id: string, watched: boolean, now = Date.now()) {
  const db = await getDb();
  if (watched) {
    await db.runAsync(
      `INSERT INTO progress (playlist_id, kind, item_id, position_ms, duration_ms, watched, updated_at) VALUES (?, 'movie', ?, 0, NULL, 1, ?)
       ON CONFLICT(playlist_id, kind, item_id) DO UPDATE SET watched = 1, updated_at = excluded.updated_at`,
      playlistId, id, now,
    );
  } else {
    await db.runAsync(`DELETE FROM progress WHERE playlist_id = ? AND kind = 'movie' AND item_id = ?`, playlistId, id);
  }
  changed();
}
