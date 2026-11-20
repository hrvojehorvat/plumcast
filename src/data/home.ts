import { getDb } from './db';

export type ContinueKey = { kind: 'movie' | 'series'; id: string };

/** Continue watching across movies and series, most recently played first. */
export async function continueOrder(playlistId: number, limit = 20): Promise<ContinueKey[]> {
  const db = await getDb();
  return db.getAllAsync<ContinueKey>(
    `SELECT 'movie' AS kind, p.item_id AS id, p.updated_at AS at
       FROM progress p JOIN movies m ON m.playlist_id = p.playlist_id AND m.id = p.item_id
      WHERE p.playlist_id = ? AND p.kind = 'movie' AND p.watched = 0 AND p.position_ms >= 60000
     UNION ALL
     SELECT 'series' AS kind, sp.series_id AS id, sp.updated_at AS at
       FROM series_progress sp JOIN series s ON s.playlist_id = sp.playlist_id AND s.id = sp.series_id
      WHERE sp.playlist_id = ? AND sp.finished = 0
     ORDER BY at DESC
     LIMIT ${Math.floor(limit)}`,
    playlistId, playlistId,
  );
}
