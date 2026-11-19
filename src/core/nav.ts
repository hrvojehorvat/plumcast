/**
 * Main navigation, in menu order. Phone shows the first four as tabs plus "More".
 * `tool` items (search, settings) aren't about watching; the TV rail sets them apart.
 */
export const NAV_ITEMS = [
  { key: 'home', href: '/', tool: false },
  { key: 'live', href: '/live', tool: false },
  { key: 'movies', href: '/movies', tool: false },
  { key: 'series', href: '/series', tool: false },
  { key: 'catchup', href: '/catchup', tool: false },
  { key: 'guide', href: '/guide', tool: false },
  { key: 'search', href: '/search', tool: true },
  { key: 'settings', href: '/settings', tool: true },
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
