import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 6;

let dbPromise: Promise<SQLiteDatabase> | null = null;

/** The one app database (catalog, playlists, settings). Opened and migrated once; a failed open can be retried. */
export function getDb(): Promise<SQLiteDatabase> {
  dbPromise ??= openWithRetry().catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

/**
 * In the browser the database file can be held by only one tab. Right after a reload the old page may
 * still hold it for a moment, so a "locked" open is tried a few more times before giving up.
 */
async function openWithRetry(): Promise<SQLiteDatabase> {
  for (let attempt = 0; ; attempt++) {
    try {
      const db = await openDatabaseAsync('plumcast.db');
      await migrate(db);
      return db;
    } catch (error) {
      if (!isStorageLocked(error) || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
}

/** True when another browser tab (or a page that is still closing) holds the database file. */
export function isStorageLocked(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /access handle|NoModificationAllowed|database is locked/i.test(text);
}

async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version > SCHEMA_VERSION) throw new Error('Database is newer than this app version');
  if (version === SCHEMA_VERSION) return;

  await db.withTransactionAsync(async () => {
    if (version < 1) {
      await db.execAsync(`
        CREATE TABLE playlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          server TEXT,
          username TEXT,
          epg_url TEXT,
          account TEXT,
          counts TEXT,
          created_at INTEGER NOT NULL,
          synced_at INTEGER
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        CREATE TABLE categories (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          id TEXT NOT NULL,
          name TEXT NOT NULL,
          sort INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, kind, id)
        );
        CREATE TABLE live (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          num INTEGER,
          name TEXT NOT NULL,
          logo TEXT,
          category_id TEXT,
          epg_id TEXT,
          archive INTEGER NOT NULL,
          archive_days INTEGER NOT NULL,
          url TEXT,
          catchup TEXT,
          sort INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, id)
        );
        CREATE INDEX live_by_category ON live (playlist_id, category_id, sort);
        CREATE TABLE movies (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          name TEXT NOT NULL,
          logo TEXT,
          category_id TEXT,
          ext TEXT,
          rating REAL,
          added_at INTEGER,
          url TEXT,
          sort INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, id)
        );
        CREATE INDEX movies_by_category ON movies (playlist_id, category_id, sort);
        CREATE TABLE series (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          name TEXT NOT NULL,
          cover TEXT,
          category_id TEXT,
          rating REAL,
          plot TEXT,
          year INTEGER,
          sort INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, id)
        );
        CREATE INDEX series_by_category ON series (playlist_id, category_id, sort);
      `);
    }
    if (version < 2) {
      // Per-playlist preferences survive a re-sync because they key on the provider's ids.
      await db.execAsync(`
        CREATE TABLE favorites (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          item_id TEXT NOT NULL,
          added_at INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, kind, item_id)
        );
        CREATE TABLE recents (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          item_id TEXT NOT NULL,
          watched_at INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, kind, item_id)
        );
        CREATE TABLE category_prefs (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          category_id TEXT NOT NULL,
          hidden INTEGER NOT NULL DEFAULT 0,
          position INTEGER,
          PRIMARY KEY (playlist_id, kind, category_id)
        );
        ALTER TABLE live ADD COLUMN search TEXT NOT NULL DEFAULT '';
        ALTER TABLE movies ADD COLUMN search TEXT NOT NULL DEFAULT '';
        ALTER TABLE series ADD COLUMN search TEXT NOT NULL DEFAULT '';
        UPDATE live SET search = lower(name);
        UPDATE movies SET search = lower(name);
        UPDATE series SET search = lower(name);
      `);
    }
    if (version < 3) {
      // TV guide (XMLTV) programmes. `channel` is the guide's channel id (live.epg_id).
      // epg_url is cleared: guide links can contain the login, so they now live in the secure store.
      await db.execAsync(`
        CREATE TABLE epg (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          channel TEXT NOT NULL,
          start INTEGER NOT NULL,
          stop INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT
        );
        CREATE INDEX epg_by_channel ON epg (playlist_id, channel, start);
        UPDATE playlists SET epg_url = NULL;
      `);
    }
    if (version < 4) {
      // Where the user stopped in a movie or episode (keyed by the provider's id, survives a re-sync).
      await db.execAsync(`
        CREATE TABLE progress (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          item_id TEXT NOT NULL,
          position_ms INTEGER NOT NULL,
          duration_ms INTEGER,
          watched INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, kind, item_id)
        );
        CREATE INDEX progress_recent ON progress (playlist_id, kind, updated_at);
        CREATE INDEX movies_by_added ON movies (playlist_id, added_at);
      `);
    }
    if (version < 5) {
      // Series: the provider's last change (for "recently updated"), M3U episodes (Xtream loads
      // them per series), and where the user is in each series (last episode played).
      await db.execAsync(`
        ALTER TABLE series ADD COLUMN updated_at INTEGER;
        CREATE INDEX series_by_updated ON series (playlist_id, updated_at);
        CREATE TABLE episodes (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          series_id TEXT NOT NULL,
          id TEXT NOT NULL,
          season INTEGER NOT NULL,
          number INTEGER NOT NULL,
          title TEXT,
          url TEXT NOT NULL,
          image TEXT,
          sort INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, id)
        );
        CREATE INDEX episodes_by_series ON episodes (playlist_id, series_id, sort);
        CREATE TABLE series_progress (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          series_id TEXT NOT NULL,
          episode_id TEXT NOT NULL,
          season INTEGER NOT NULL,
          episode INTEGER NOT NULL,
          finished INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, series_id)
        );
        CREATE INDEX series_progress_recent ON series_progress (playlist_id, updated_at);
      `);
    }
    if (version < 6) {
      // Full search: programme titles folded like channel names (old rows get a plain lower-case
      // copy until the next guide update), and channels found by their guide id.
      await db.execAsync(`
        ALTER TABLE epg ADD COLUMN search TEXT NOT NULL DEFAULT '';
        UPDATE epg SET search = lower(title);
        CREATE INDEX live_by_epg ON live (playlist_id, lower(epg_id));
      `);
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

/**
 * Inserts many rows with multi-row INSERTs. One statement per row would mean 100k round
 * trips to the SQLite worker on web; batches keep a big catalog to a few hundred.
 */
export async function insertMany(db: SQLiteDatabase, table: string, columns: readonly string[], rows: readonly unknown[][]) {
  if (!rows.length) return;
  const perStatement = Math.max(1, Math.floor(900 / columns.length)); // stays under SQLite's 999-variable limit
  const tuple = `(${columns.map(() => '?').join(',')})`;
  for (let i = 0; i < rows.length; i += perStatement) {
    const chunk = rows.slice(i, i + perStatement);
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${Array(chunk.length).fill(tuple).join(',')}`;
    await db.runAsync(sql, chunk.flat() as (string | number | null)[]);
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  return (await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key))?.value ?? null;
}

export async function setSetting(key: string, value: string | null) {
  const db = await getDb();
  if (value === null) await db.runAsync('DELETE FROM settings WHERE key = ?', key);
  else await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
