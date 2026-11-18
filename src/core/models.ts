/** Shapes shared by the Xtream client, the M3U parser, sync and the screens. */

export type PlaylistKind = 'xtream' | 'm3u-url' | 'm3u-file';
export type ContentKind = 'live' | 'movie' | 'series';

export interface AccountInfo {
  /** As sent by the server: "Active", "Expired", "Banned", "Disabled"… */
  status: string;
  /** Unix ms, or null for "never expires". */
  expiresAt: number | null;
  isTrial: boolean;
  activeConnections: number;
  maxConnections: number;
  allowedFormats: string[];
  serverTimezone: string | null;
}

export interface Category {
  kind: ContentKind;
  id: string;
  name: string;
}

/** How an M3U channel builds its catch-up URL (`catchup` attribute). */
export interface M3uCatchup {
  mode: string;
  source: string | null;
}

export interface LiveChannel {
  id: string;
  num: number | null;
  name: string;
  logo: string | null;
  categoryId: string | null;
  epgId: string | null;
  /** Has a catch-up archive on the server. */
  archive: boolean;
  archiveDays: number;
  /** Full stream URL for M3U; null for Xtream (built from credentials). */
  url: string | null;
  catchup: M3uCatchup | null;
}

export interface Movie {
  id: string;
  name: string;
  logo: string | null;
  categoryId: string | null;
  /** File extension for the Xtream movie URL ("mp4", "mkv"…). */
  ext: string | null;
  rating: number | null;
  /** Unix ms when the provider added it. */
  addedAt: number | null;
  url: string | null;
}

export interface Series {
  id: string;
  name: string;
  cover: string | null;
  categoryId: string | null;
  rating: number | null;
  plot: string | null;
  year: number | null;
}

/** Everything one sync downloads for a playlist. */
export interface Catalog {
  categories: Category[];
  live: LiveChannel[];
  movies: Movie[];
  series: Series[];
  epgUrl: string | null;
  account: AccountInfo | null;
}

export interface CatalogCounts {
  live: number;
  movies: number;
  series: number;
  liveCategories: number;
  movieCategories: number;
  seriesCategories: number;
}

export function countCatalog(catalog: Catalog): CatalogCounts {
  const cats = (kind: ContentKind) => catalog.categories.filter((c) => c.kind === kind).length;
  return {
    live: catalog.live.length,
    movies: catalog.movies.length,
    series: catalog.series.length,
    liveCategories: cats('live'),
    movieCategories: cats('movie'),
    seriesCategories: cats('series'),
  };
}

/** Things we never put in SQLite: the Xtream password and the M3U URL (it often contains the login). */
export interface PlaylistSecret {
  password?: string;
  m3uUrl?: string;
  /** The guide link from the M3U `url-tvg` header (may contain a login, so it lives here, not in SQLite). */
  guideUrl?: string;
  /** A guide (XMLTV) link the user entered to replace the provider's guide. Empty = none. */
  guideOverride?: string;
}

/** What the playlist form produces: the stored fields plus the secret part. */
export interface PlaylistDraft {
  name: string;
  kind: PlaylistKind;
  /** Xtream: the normalised server URL. M3U link: only the host, for display. */
  server: string | null;
  username: string | null;
  secret: PlaylistSecret;
}
