/**
 * Main navigation, in menu order. Phone shows the first four as tabs plus "More".
 * `tool` items (search, settings) aren't about watching; the TV rail sets them apart.
 * `columns`: on TV the page starts with a categories column, which OK in the menu moves into.
 */
export const NAV_ITEMS = [
  { key: 'home', href: '/', tool: false, columns: false },
  { key: 'live', href: '/live', tool: false, columns: true },
  { key: 'movies', href: '/movies', tool: false, columns: true },
  { key: 'series', href: '/series', tool: false, columns: true },
  { key: 'catchup', href: '/catchup', tool: false, columns: true },
  { key: 'guide', href: '/guide', tool: false, columns: true },
  { key: 'search', href: '/search', tool: true, columns: false },
  { key: 'settings', href: '/settings', tool: true, columns: false },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]['key'];

export const PHONE_TABS: readonly NavKey[] = ['home', 'live', 'movies', 'series'];
export const PHONE_MORE: readonly NavKey[] = ['catchup', 'guide', 'search', 'settings'];

/** Which nav item a pathname belongs to ("/live/123" → "live"). */
export function navKeyForPath(pathname: string): NavKey | 'more' {
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  if (first === 'more') return 'more';
  if (first === 'playlists') return 'settings';
  return NAV_ITEMS.find((item) => item.href === `/${first}`)?.key ?? 'home';
}

/** What the Android Back key does on a page: go to a page, leave the app, or let the page / navigator handle it. */
export type BackAction = { go: string } | 'exit' | 'pass';

/**
 * Back on a main section goes Home (on phones the "More" sections go back to More); Back on Home
 * leaves the app. Sub pages (details, playlists, …) handle Back themselves.
 */
export function backAction(pathname: string, wide: boolean): BackAction {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'exit';
  if (path === '/more') return { go: '/' };
  const item = NAV_ITEMS.find((i) => i.href === path);
  if (!item) return 'pass';
  return { go: !wide && PHONE_MORE.includes(item.key) ? '/more' : '/' };
}
