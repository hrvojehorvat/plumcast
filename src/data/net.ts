import { Platform } from 'react-native';
import type { FetchLike } from '../core/http';
import { normalizeServer } from '../core/xtream';

/**
 * Development login from apps/plumcast/.env.local (gitignored). Only read in dev builds:
 * `__DEV__` is false in release builds, so the minifier drops these values entirely.
 */
export const DEV_LOGIN = __DEV__
  ? {
      server: process.env.EXPO_PUBLIC_DEV_XTREAM_URL ?? '',
      username: process.env.EXPO_PUBLIC_DEV_XTREAM_USER ?? '',
      password: process.env.EXPO_PUBLIC_DEV_XTREAM_PASS ?? '',
    }
  : null;

const DEV_PROXY = __DEV__ ? `http://127.0.0.1:${process.env.EXPO_PUBLIC_DEV_PROXY_PORT || 8787}` : '';
const devOrigin = (() => {
  const server = DEV_LOGIN?.server ? normalizeServer(DEV_LOGIN.server) : null;
  return server ? /^https?:\/\/[^/]+/i.exec(server)?.[0] ?? null : null;
})();

/** True when requests can't reach arbitrary servers (browser without CORS). */
export const BROWSER_DEV = Platform.OS === 'web';

/** In the browser, send requests for the .env.local server through the local dev proxy. */
export function routeUrl(url: string): string {
  if (Platform.OS === 'web' && devOrigin && url.toLowerCase().startsWith(devOrigin.toLowerCase())) {
    return DEV_PROXY + url.slice(devOrigin.length);
  }
  return url;
}

export const appFetch: FetchLike = (url, init) => fetch(routeUrl(url), init);
