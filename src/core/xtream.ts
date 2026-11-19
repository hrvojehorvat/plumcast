import { bool, list, num, obj, str, unixMs } from './coerce';
import { PlaylistError } from './errors';
import { getJson, type FetchLike, type RequestOptions } from './http';
import type { AccountInfo, Catalog, Category, ContentKind, LiveChannel, Movie, Series } from './models';

export interface XtreamLogin {
  /** Normalised base URL, e.g. "http://example.com:8080". */
  server: string;
  username: string;
  password: string;
}

// URL parsing by hand: React Native's URL class doesn't implement host/pathname getters.
const URL_RE = /^(https?):\/\/([^/?#\s]+)([^?#\s]*)(\?[^#\s]*)?/i;
const ENDPOINTS = /\/(player_api|get|xmltv|panel_api)\.php$/i;

/**
 * Cleans up what the user typed as the server: adds http://, drops a trailing slash and
 * any endpoint they pasted. Returns null when it isn't an http(s) address.
 */
export function normalizeServer(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const match = URL_RE.exec(withScheme);
  if (!match) return null;
  const [, scheme, host, path] = match;
  const cleanPath = (path ?? '').replace(ENDPOINTS, '').replace(/\/+$/, '');
  return `${scheme.toLowerCase()}://${host}${cleanPath}`;
}

/**
 * Providers often hand out one M3U link with the login in it
 * (`…/get.php?username=U&password=P&type=m3u_plus`). Pull the parts out so the user
 * can paste it into the server field.
 */
export function parseXtreamLink(input: string): Partial<XtreamLogin> & { server: string } | null {
  const server = normalizeServer(input);
  if (!server) return null;
  const query = URL_RE.exec(/^[a-z]+:\/\//i.test(input.trim()) ? input.trim() : `http://${input.trim()}`)?.[4] ?? '';
  const params = new Map<string, string>();
  for (const pair of query.replace(/^\?/, '').split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k) params.set(decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' ')));
  }
  return { server, username: params.get('username') || undefined, password: params.get('password') || undefined };
}

export function apiUrl(login: XtreamLogin, action?: string, params: Record<string, string | number> = {}): string {
  const query = [`username=${encodeURIComponent(login.username)}`, `password=${encodeURIComponent(login.password)}`];
  if (action) query.push(`action=${action}`);
  for (const [k, v] of Object.entries(params)) query.push(`${k}=${encodeURIComponent(String(v))}`);
  return `${login.server}/player_api.php?${query.join('&')}`;
}

export function xmltvUrl(login: XtreamLogin): string {
  return `${login.server}/xmltv.php?username=${encodeURIComponent(login.username)}&password=${encodeURIComponent(login.password)}`;
}

export function parseAccount(json: unknown): AccountInfo {
  const root = obj(json);
  const user = obj(root.user_info);
  const server = obj(root.server_info);
  if (!bool(user.auth)) throw new PlaylistError('auth', 'Wrong username or password');
  return {
    status: str(user.status) ?? 'Active',
    expiresAt: unixMs(user.exp_date),
    isTrial: bool(user.is_trial),
    activeConnections: num(user.active_cons) ?? 0,
    maxConnections: num(user.max_connections) ?? 0,
    allowedFormats: list(user.allowed_output_formats).map(str).filter((f): f is string => f !== null),
    serverTimezone: str(server.timezone),
  };
}

/** Login check: throws for wrong credentials, expired or blocked accounts. */
export function assertUsable(account: AccountInfo, now = Date.now()): void {
  const status = account.status.toLowerCase();
  if (status === 'expired' || (account.expiresAt !== null && account.expiresAt < now)) {
    throw new PlaylistError('expired', 'Account expired');
  }
  if (status === 'banned' || status === 'disabled') throw new PlaylistError('blocked', `Account ${status}`);
}

export function parseCategories(json: unknown, kind: ContentKind): Category[] {
  const out: Category[] = [];
  for (const item of list(json)) {
    const c = obj(item);
    const id = str(c.category_id);
    if (id) out.push({ kind, id, name: str(c.category_name) ?? id });
  }
  return out;
}

/** Some panels send `category_ids: [..]` instead of `category_id`. */
function categoryOf(item: Record<string, unknown>): string | null {
  return str(item.category_id) ?? str(list(item.category_ids)[0]);
}

export function parseLiveStreams(json: unknown): LiveChannel[] {
  const out: LiveChannel[] = [];
  for (const raw of list(json)) {
    const s = obj(raw);
    const id = str(s.stream_id);
    if (!id) continue;
    const archive = bool(s.tv_archive);
    out.push({
      id,
      num: num(s.num),
      name: str(s.name) ?? id,
      logo: str(s.stream_icon),
      categoryId: categoryOf(s),
      epgId: str(s.epg_channel_id),
      archive,
      archiveDays: archive ? (num(s.tv_archive_duration) ?? 0) : 0,
      url: null,
      catchup: null,
    });
  }
  return out;
}

export function parseMovies(json: unknown): Movie[] {
  const out: Movie[] = [];
  for (const raw of list(json)) {
    const s = obj(raw);
    const id = str(s.stream_id);
    if (!id) continue;
    out.push({
      id,
      name: str(s.name) ?? id,
      logo: str(s.stream_icon),
      categoryId: categoryOf(s),
      ext: str(s.container_extension),
      rating: num(s.rating) ?? (num(s.rating_5based) !== null ? num(s.rating_5based)! * 2 : null),
      addedAt: unixMs(s.added),
      url: null,
    });
  }
  return out;
}

export function parseSeries(json: unknown): Series[] {
  const out: Series[] = [];
  for (const raw of list(json)) {
    const s = obj(raw);
    const id = str(s.series_id);
    if (!id) continue;
    const date = str(s.releaseDate) ?? str(s.release_date) ?? str(s.year);
    const year = date ? num(date.slice(0, 4)) : null;
    out.push({
      id,
      name: str(s.name) ?? id,
      cover: str(s.cover),
      categoryId: categoryOf(s),
      rating: num(s.rating),
      plot: str(s.plot),
      year: year && year > 1900 ? year : null,
      updatedAt: unixMs(s.last_modified),
    });
  }
  return out;
}

export const SYNC_STEPS = ['account', 'liveCategories', 'live', 'movieCategories', 'movies', 'seriesCategories', 'series'] as const;
export type SyncStep = (typeof SYNC_STEPS)[number] | 'download' | 'parse' | 'save';

export interface SyncOptions extends RequestOptions {
  onStep?: (step: SyncStep, index: number, total: number) => void;
  now?: number;
}

/** Logs in and downloads the whole catalog (categories + streams for live, movies, series). */
export async function fetchXtreamCatalog(login: XtreamLogin, fetcher: FetchLike, options: SyncOptions = {}): Promise<Catalog> {
  const { onStep, signal } = options;
  const total = SYNC_STEPS.length + 1; // + saving, reported by the caller
  const step = (name: SyncStep) => onStep?.(name, SYNC_STEPS.indexOf(name as never), total);
  const small = { signal, timeoutMs: 30_000 };
  const big = { signal, timeoutMs: 180_000 };

  step('account');
  const account = parseAccount(await getJson(fetcher, apiUrl(login), small));
  assertUsable(account, options.now);

  step('liveCategories');
  const liveCats = parseCategories(await getJson(fetcher, apiUrl(login, 'get_live_categories'), small), 'live');
  step('live');
  const live = parseLiveStreams(await getJson(fetcher, apiUrl(login, 'get_live_streams'), big));
  step('movieCategories');
  const movieCats = parseCategories(await getJson(fetcher, apiUrl(login, 'get_vod_categories'), small), 'movie');
  step('movies');
  const movies = parseMovies(await getJson(fetcher, apiUrl(login, 'get_vod_streams'), big));
  step('seriesCategories');
  const seriesCats = parseCategories(await getJson(fetcher, apiUrl(login, 'get_series_categories'), small), 'series');
  step('series');
  const series = parseSeries(await getJson(fetcher, apiUrl(login, 'get_series'), big));

  if (!live.length && !movies.length && !series.length) throw new PlaylistError('empty', 'The playlist has no content');

  return {
    categories: [...liveCats, ...movieCats, ...seriesCats],
    live,
    movies,
    series,
    episodes: [],
    epgUrl: xmltvUrl(login),
    account,
  };
}

