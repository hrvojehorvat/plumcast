import type { Programme } from '../core/epg';
import { foldSearch } from '../core/search';
import { getDb, getSetting, insertMany, setSetting } from './db';

/** Stored TV guide (XMLTV) programmes. Channel ids are kept lower-case; lookups lower-case too. */

export interface GuideStatus {
  fetchedAt: number;
  /** Programmes stored. */
  count: number;
  /** Time span of the stored programmes (null when none). */
  first: number | null;
  last: number | null;
}

interface Row {
  start: number;
  stop: number;
  title: string;
  description: string | null;
}

const toProgramme = (r: Row): Programme => ({ start: r.start, end: r.stop, title: r.title, description: r.description });

export async function readGuideStatus(playlistId: number): Promise<GuideStatus | null> {
  const raw = await getSetting(`guide:${playlistId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuideStatus;
  } catch {
    return null;
  }
}

/** The epg ids of a playlist's channels (lower-case), to keep only programmes that can be shown. */
export async function guideChannelIds(playlistId: number): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT DISTINCT lower(epg_id) AS id FROM live WHERE playlist_id = ? AND epg_id IS NOT NULL AND epg_id != ?',
    playlistId, '',
  );
  return new Set(rows.map((r) => r.id));
}

export type GuideRow = [channel: string, start: number, stop: number, title: string, description: string | null];

/** Replaces a playlist's whole guide in one transaction, so a failed save keeps the old guide. */
export async function saveGuide(playlistId: number, rows: readonly GuideRow[], now = Date.now()): Promise<GuideStatus> {
  const db = await getDb();
  let first: number | null = null;
  let last: number | null = null;
  for (const r of rows) {
    if (first === null || r[1] < first) first = r[1];
    if (last === null || r[2] > last) last = r[2];
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM epg WHERE playlist_id = ?', playlistId);
    await insertMany(db, 'epg', ['playlist_id', 'channel', 'start', 'stop', 'title', 'description', 'search'], rows.map((r) => [playlistId, ...r, foldSearch(r[3])]));
  });
  const status: GuideStatus = { fetchedAt: now, count: rows.length, first, last };
  await setSetting(`guide:${playlistId}`, JSON.stringify(status));
  return status;
}

/** One channel's programmes that overlap [from, to), by its guide id. */
export async function programmesByEpgId(playlistId: number, epgId: string, from: number, to: number): Promise<Programme[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    'SELECT start, stop, title, description FROM epg WHERE playlist_id = ? AND channel = ? AND stop > ? AND start < ? ORDER BY start',
    playlistId, epgId.toLowerCase(), from, to,
  );
  return rows.map(toProgramme);
}

/** The next few programmes of a channel (by stream id), for now/next. */
export async function upcomingByChannel(playlistId: number, channelId: string, from: number, limit = 8): Promise<Programme[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT e.start, e.stop, e.title, e.description
       FROM live l JOIN epg e ON e.playlist_id = l.playlist_id AND e.channel = lower(l.epg_id)
      WHERE l.playlist_id = ? AND l.id = ? AND e.stop > ?
      ORDER BY e.start LIMIT ?`,
    playlistId, channelId, from, limit,
  );
  return rows.map(toProgramme);
}
