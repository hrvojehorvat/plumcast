import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 2;

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
