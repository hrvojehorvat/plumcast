import { useSyncExternalStore } from 'react';
import type { M3uCatchup } from '../core/models';
import { likeContains } from '../core/search';
import { getDb } from './db';

/** Built-in lists shown above the provider's categories. */
export const ALL = ':all';
export const FAVORITES = ':fav';
export const RECENT = ':recent';
export type VirtualCategory = typeof ALL | typeof FAVORITES | typeof RECENT;
export const isVirtual = (id: string): id is VirtualCategory => id === ALL || id === FAVORITES || id === RECENT;

const RECENT_LIMIT = 50;

export interface LiveCategory {
  id: string;
  name: string;
  count: number;
  hidden: boolean;
}

export interface Channel {
  id: string;
  num: number | null;
  name: string;
  logo: string | null;
  categoryId: string | null;
  epgId: string | null;
  archive: boolean;
  archiveDays: number;
  url: string | null;
  catchup: M3uCatchup | null;
  favorite: boolean;
}

interface ChannelRow {
  id: string;
  num: number | null;
  name: string;
  logo: string | null;
  category_id: string | null;
  epg_id: string | null;
  archive: number;
  archive_days: number;
  url: string | null;
  catchup: string | null;
  fav: number;
}

const toChannel = (r: ChannelRow): Channel => ({
  id: r.id,
  num: r.num,
  name: r.name,
  logo: r.logo,
  categoryId: r.category_id,
  epgId: r.epg_id,
  archive: r.archive === 1,
  archiveDays: r.archive_days,
  url: r.url,
  catchup: r.catchup ? (JSON.parse(r.catchup) as M3uCatchup) : null,
  favorite: r.fav === 1,
});

// ---- change notifications: screens re-query after favourites / prefs change ----

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
/** A number that goes up whenever favourites, recents or category settings change. */
export function useLiveVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

// ---- categories ----

/** Live categories in the user's order. Hidden ones are left out unless `withHidden`. */
export async function listLiveCategories(playlistId: number, withHidden = false): Promise<LiveCategory[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; count: number; hidden: number }>(
    `SELECT c.id, c.name, COALESCE(n.count, 0) AS count, COALESCE(p.hidden, 0) AS hidden
       FROM categories c
       LEFT JOIN category_prefs p ON p.playlist_id = c.playlist_id AND p.kind = c.kind AND p.category_id = c.id
       LEFT JOIN (SELECT category_id, COUNT(*) AS count FROM live WHERE playlist_id = ? GROUP BY category_id) n ON n.category_id = c.id
      WHERE c.playlist_id = ? AND c.kind = 'live'
      ORDER BY p.position IS NULL, p.position, c.sort`,
    playlistId, playlistId,
  );
  return rows.filter((r) => withHidden || !r.hidden).map((r) => ({ id: r.id, name: r.name, count: r.count, hidden: r.hidden === 1 }));
}

export async function setCategoryHidden(playlistId: number, categoryId: string, hidden: boolean) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO category_prefs (playlist_id, kind, category_id, hidden) VALUES (?, 'live', ?, ?)
     ON CONFLICT(playlist_id, kind, category_id) DO UPDATE SET hidden = excluded.hidden`,
    playlistId, categoryId, hidden ? 1 : 0,
  );
  changed();
}

/** Stores the full order (category ids, top to bottom). */
export async function saveCategoryOrder(playlistId: number, ids: readonly string[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < ids.length; i++) {
      await db.runAsync(
        `INSERT INTO category_prefs (playlist_id, kind, category_id, position) VALUES (?, 'live', ?, ?)
         ON CONFLICT(playlist_id, kind, category_id) DO UPDATE SET position = excluded.position`,
        playlistId, ids[i], i,
      );
    }
  });
  changed();
}

export async function resetCategoryPrefs(playlistId: number) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM category_prefs WHERE playlist_id = ? AND kind = 'live'`, playlistId);
  changed();
}

// ---- channels ----

const CHANNEL_COLUMNS = `l.id, l.num, l.name, l.logo, l.category_id, l.epg_id, l.archive, l.archive_days, l.url, l.catchup,
  (f.item_id IS NOT NULL) AS fav`;
const FAV_JOIN = `LEFT JOIN favorites f ON f.playlist_id = l.playlist_id AND f.kind = 'live' AND f.item_id = l.id`;
/** Channels Catch-up lists: every Xtream channel, M3U channels with catch-up attributes. */
const REPLAYABLE = `(l.archive = 1 OR l.url IS NULL)`;
const NOT_HIDDEN = `(l.category_id IS NULL OR l.category_id NOT IN
  (SELECT category_id FROM category_prefs WHERE playlist_id = l.playlist_id AND kind = 'live' AND hidden = 1))`;

/**
 * Channels of one category (or a built-in list), optionally filtered by a search text.
 * The search only looks inside that list, which keeps it fast on big playlists.
 */
export async function listChannels(playlistId: number, categoryId: string, query = '', archiveOnly = false, limit?: number): Promise<Channel[]> {
  const db = await getDb();
  const params: (string | number)[] = [playlistId];
  let join = FAV_JOIN;
  let where = archiveOnly ? `l.playlist_id = ? AND ${REPLAYABLE}` : 'l.playlist_id = ?';
  let order = 'l.sort';
  if (categoryId === ALL) {
    where += ` AND ${NOT_HIDDEN}`;
  } else if (categoryId === FAVORITES) {
    join = `JOIN favorites f ON f.playlist_id = l.playlist_id AND f.kind = 'live' AND f.item_id = l.id`;
    order = 'f.added_at';
  } else if (categoryId === RECENT) {
    join += ` JOIN recents r ON r.playlist_id = l.playlist_id AND r.kind = 'live' AND r.item_id = l.id`;
    order = 'r.watched_at DESC';
  } else {
    where += ' AND l.category_id = ?';
    params.push(categoryId);
  }
  if (query.trim()) {
    where += ` AND l.search LIKE ? ESCAPE '\\'`;
    params.push(likeContains(query));
  }
  const rows = await db.getAllAsync<ChannelRow>(`SELECT ${CHANNEL_COLUMNS} FROM live l ${join} WHERE ${where} ORDER BY ${order}${limit ? ` LIMIT ${Math.floor(limit)}` : ''}`, ...params);
  return rows.map(toChannel);
}

/** Categories (user order, hidden ones left out) that have channels with catch-up, with that count. */
export async function listArchiveCategories(playlistId: number): Promise<LiveCategory[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; count: number }>(
    `SELECT c.id, c.name, n.count
       FROM categories c
       JOIN (SELECT category_id, COUNT(*) AS count FROM live l WHERE l.playlist_id = ? AND ${REPLAYABLE} GROUP BY category_id) n ON n.category_id = c.id
       LEFT JOIN category_prefs p ON p.playlist_id = c.playlist_id AND p.kind = c.kind AND p.category_id = c.id
      WHERE c.playlist_id = ? AND c.kind = 'live' AND COALESCE(p.hidden, 0) = 0
      ORDER BY p.position IS NULL, p.position, c.sort`,
    playlistId, playlistId,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, count: r.count, hidden: false }));
}

/** How many favourite channels and channels overall have catch-up. */
export async function countArchiveChannels(playlistId: number): Promise<{ favorites: number; all: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ favorites: number; all: number }>(
    `SELECT (SELECT COUNT(*) FROM favorites f JOIN live l ON l.playlist_id = f.playlist_id AND l.id = f.item_id
              WHERE f.playlist_id = ? AND f.kind = 'live' AND ${REPLAYABLE}) AS favorites,
            (SELECT COUNT(*) FROM live l WHERE l.playlist_id = ? AND ${REPLAYABLE} AND ${NOT_HIDDEN}) AS "all"`,
    playlistId, playlistId,
  );
  return row ?? { favorites: 0, all: 0 };
}

export interface AiredItem {
  channel: Channel;
  programme: { start: number; end: number; title: string; description: string | null };
}

/**
 * Programmes from the stored guide that ended in [from, to) on channels with catch-up (optionally
 * one category or favourites), newest first. Each channel's own archive window is checked later.
 */
export async function recentlyAired(playlistId: number, categoryId: string, from: number, to: number, limit = 300): Promise<AiredItem[]> {
  const db = await getDb();
  const params: (string | number)[] = [playlistId, from, to];
  let join = FAV_JOIN;
  let where = `l.playlist_id = ? AND ${REPLAYABLE} AND e.stop > ? AND e.stop <= ?`;
  if (categoryId === FAVORITES) join = `JOIN favorites f ON f.playlist_id = l.playlist_id AND f.kind = 'live' AND f.item_id = l.id`;
  else if (categoryId === ALL) where += ` AND ${NOT_HIDDEN}`;
  else {
    where += ' AND l.category_id = ?';
    params.push(categoryId);
  }
  const rows = await db.getAllAsync<ChannelRow & { p_start: number; p_stop: number; p_title: string; p_description: string | null }>(
    `SELECT ${CHANNEL_COLUMNS}, e.start AS p_start, e.stop AS p_stop, e.title AS p_title, e.description AS p_description
       FROM live l ${join}
       JOIN epg e ON e.playlist_id = l.playlist_id AND e.channel = lower(l.epg_id)
      WHERE ${where}
      ORDER BY e.stop DESC, l.sort
      LIMIT ${limit}`,
    ...params,
  );
  return rows.map((r) => ({ channel: toChannel(r), programme: { start: r.p_start, end: r.p_stop, title: r.p_title, description: r.p_description } }));
}

/**
 * Full search in the stored guide: programmes in [from, to) whose title contains `query`, closest
 * to `around` first, each with the first visible channel that carries it (duplicates collapse).
 * CROSS JOIN keeps the matched programmes as the outer loop; otherwise SQLite may rerun the
 * programme scan once per channel (minutes on a real playlist).
 */
export async function searchProgrammes(playlistId: number, query: string, from: number, to: number, around: number, limit = 120): Promise<AiredItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ChannelRow & { p_start: number; p_stop: number; p_title: string; p_description: string | null }>(
    `SELECT ${CHANNEL_COLUMNS}, e.start AS p_start, e.stop AS p_stop, e.title AS p_title, e.description AS p_description, MIN(l.sort) AS first_sort
       FROM (SELECT channel, start, stop, title, description FROM epg
              WHERE playlist_id = ? AND stop > ? AND start < ? AND search LIKE ? ESCAPE '\\'
              ORDER BY abs(start - ?) LIMIT ${Math.floor(limit) * 3}) e
       CROSS JOIN live l ON l.playlist_id = ? AND lower(l.epg_id) = e.channel
       ${FAV_JOIN}
      WHERE ${NOT_HIDDEN}
      GROUP BY e.channel, e.start
      ORDER BY abs(e.start - ?)
      LIMIT ${Math.floor(limit)}`,
    playlistId, from, to, likeContains(query), around, playlistId, around,
  );
  return rows.map((r) => ({ channel: toChannel(r), programme: { start: r.p_start, end: r.p_stop, title: r.p_title, description: r.p_description } }));
}

export async function getChannel(playlistId: number, id: string): Promise<Channel | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ChannelRow>(`SELECT ${CHANNEL_COLUMNS} FROM live l ${FAV_JOIN} WHERE l.playlist_id = ? AND l.id = ?`, playlistId, id);
  return row ? toChannel(row) : null;
}

/** For typing a channel number in the player. */
export async function channelByNumber(playlistId: number, num: number): Promise<Channel | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ChannelRow>(
    `SELECT ${CHANNEL_COLUMNS} FROM live l ${FAV_JOIN} WHERE l.playlist_id = ? AND l.num = ? AND ${NOT_HIDDEN} ORDER BY l.sort LIMIT 1`,
    playlistId, num,
  );
  return row ? toChannel(row) : null;
}

// ---- favourites and recents ----

export async function setFavorite(playlistId: number, channelId: string, favorite: boolean, now = Date.now()) {
  const db = await getDb();
  if (favorite) {
    await db.runAsync(`INSERT OR IGNORE INTO favorites (playlist_id, kind, item_id, added_at) VALUES (?, 'live', ?, ?)`, playlistId, channelId, now);
  } else {
    await db.runAsync(`DELETE FROM favorites WHERE playlist_id = ? AND kind = 'live' AND item_id = ?`, playlistId, channelId);
  }
  changed();
}

/** Remembers a watched channel; keeps the newest 50. */
export async function addRecent(playlistId: number, channelId: string, now = Date.now()) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO recents (playlist_id, kind, item_id, watched_at) VALUES (?, 'live', ?, ?)
     ON CONFLICT(playlist_id, kind, item_id) DO UPDATE SET watched_at = excluded.watched_at`,
    playlistId, channelId, now,
  );
  await db.runAsync(
    `DELETE FROM recents WHERE playlist_id = ? AND kind = 'live' AND item_id NOT IN
       (SELECT item_id FROM recents WHERE playlist_id = ? AND kind = 'live' ORDER BY watched_at DESC LIMIT ${RECENT_LIMIT})`,
    playlistId, playlistId,
  );
  changed();
}

export async function countFavoritesAndRecents(playlistId: number): Promise<{ favorites: number; recent: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ favorites: number; recent: number }>(
    `SELECT (SELECT COUNT(*) FROM favorites f JOIN live l ON l.playlist_id = f.playlist_id AND l.id = f.item_id WHERE f.playlist_id = ? AND f.kind = 'live') AS favorites,
            (SELECT COUNT(*) FROM recents r JOIN live l ON l.playlist_id = r.playlist_id AND l.id = r.item_id WHERE r.playlist_id = ? AND r.kind = 'live') AS recent`,
    playlistId, playlistId,
  );
  return row ?? { favorites: 0, recent: 0 };
}
