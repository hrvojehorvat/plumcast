import type { AccountInfo, Catalog, CatalogCounts, PlaylistDraft, PlaylistKind } from '../core/models';
import { countCatalog } from '../core/models';
import { getDb, getSetting, insertMany, setSetting } from './db';
import { deleteSecret, readSecret, writeSecret } from './secrets';

export interface Playlist {
  id: number;
  name: string;
  kind: PlaylistKind;
  /** Xtream: the server URL. M3U URL: just the host, for display (the full URL is a secret). */
  server: string | null;
  username: string | null;
  epgUrl: string | null;
  account: AccountInfo | null;
  counts: CatalogCounts | null;
  createdAt: number;
  syncedAt: number | null;
}

interface Row {
  id: number;
  name: string;
  kind: PlaylistKind;
  server: string | null;
  username: string | null;
  epg_url: string | null;
  account: string | null;
  counts: string | null;
  created_at: number;
  synced_at: number | null;
}

const fromRow = (r: Row): Playlist => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  server: r.server,
  username: r.username,
  epgUrl: r.epg_url,
  account: r.account ? (JSON.parse(r.account) as AccountInfo) : null,
  counts: r.counts ? (JSON.parse(r.counts) as CatalogCounts) : null,
  createdAt: r.created_at,
  syncedAt: r.synced_at,
});

export async function listPlaylists(): Promise<Playlist[]> {
  const db = await getDb();
  return (await db.getAllAsync<Row>('SELECT * FROM playlists ORDER BY created_at')).map(fromRow);
}

/** Stores a new playlist and its catalog together, so a half-added playlist never shows up. */
export async function createPlaylist(draft: PlaylistDraft, catalog: Catalog, now = Date.now()): Promise<number> {
  const db = await getDb();
  let id = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'INSERT INTO playlists (name, kind, server, username, created_at) VALUES (?, ?, ?, ?, ?)',
      draft.name, draft.kind, draft.server, draft.username, now,
    );
    id = result.lastInsertRowId;
    await writeCatalog(id, catalog, now);
  });
  await writeSecret(id, draft.secret);
  return id;
}

/**
 * Saves edits. With a catalog (the source changed and was re-downloaded) it is replaced too.
 * Blank secret fields keep the saved ones, unless the kind changed.
 */
export async function updatePlaylist(id: number, draft: PlaylistDraft, catalog: Catalog | null, now = Date.now()) {
  const db = await getDb();
  const old = await db.getFirstAsync<{ kind: PlaylistKind }>('SELECT kind FROM playlists WHERE id = ?', id);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE playlists SET name = ?, kind = ?, server = ?, username = ? WHERE id = ?', draft.name, draft.kind, draft.server, draft.username, id);
    if (catalog) await writeCatalog(id, catalog, now);
  });
  const keep = old?.kind === draft.kind ? await readSecret(id) : {};
  await writeSecret(id, { ...keep, ...draft.secret });
}

export async function deletePlaylist(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM playlists WHERE id = ?', id);
  await deleteSecret(id);
}

export { readSecret };

export async function getActiveId(): Promise<number | null> {
  const value = await getSetting('activePlaylist');
  return value ? Number(value) : null;
}

export async function setActiveId(id: number | null) {
  await setSetting('activePlaylist', id === null ? null : String(id));
}

/** Replaces a playlist's catalog in one transaction, so a failed save keeps the old data. */
export async function saveCatalog(id: number, catalog: Catalog, now = Date.now()) {
  const db = await getDb();
  await db.withTransactionAsync(() => writeCatalog(id, catalog, now));
}

/** The catalog writes; call inside a transaction. */
async function writeCatalog(id: number, catalog: Catalog, now: number) {
  const db = await getDb();
  {
    for (const table of ['categories', 'live', 'movies', 'series']) {
      await db.runAsync(`DELETE FROM ${table} WHERE playlist_id = ?`, id);
    }
    await insertMany(db, 'categories', ['playlist_id', 'kind', 'id', 'name', 'sort'], catalog.categories.map((c, i) => [id, c.kind, c.id, c.name, i]));
    await insertMany(
      db,
      'live',
      ['playlist_id', 'id', 'num', 'name', 'logo', 'category_id', 'epg_id', 'archive', 'archive_days', 'url', 'catchup', 'sort'],
      catalog.live.map((c, i) => [id, c.id, c.num, c.name, c.logo, c.categoryId, c.epgId, c.archive ? 1 : 0, c.archiveDays, c.url, c.catchup ? JSON.stringify(c.catchup) : null, i]),
    );
    await insertMany(
      db,
      'movies',
      ['playlist_id', 'id', 'name', 'logo', 'category_id', 'ext', 'rating', 'added_at', 'url', 'sort'],
      catalog.movies.map((m, i) => [id, m.id, m.name, m.logo, m.categoryId, m.ext, m.rating, m.addedAt, m.url, i]),
    );
    await insertMany(
      db,
      'series',
      ['playlist_id', 'id', 'name', 'cover', 'category_id', 'rating', 'plot', 'year', 'sort'],
      catalog.series.map((s, i) => [id, s.id, s.name, s.cover, s.categoryId, s.rating, s.plot, s.year, i]),
    );
    await db.runAsync(
      'UPDATE playlists SET epg_url = ?, account = ?, counts = ?, synced_at = ? WHERE id = ?',
      catalog.epgUrl, catalog.account ? JSON.stringify(catalog.account) : null, JSON.stringify(countCatalog(catalog)), now, id,
    );
  }
}
