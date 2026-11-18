/** Main navigation, in menu order. Phone shows the first four as tabs plus "More". */
export const NAV_ITEMS = [
  { key: 'home', href: '/' },
  { key: 'live', href: '/live' },
  { key: 'guide', href: '/guide' },
  { key: 'movies', href: '/movies' },
  { key: 'series', href: '/series' },
  { key: 'catchup', href: '/catchup' },
  { key: 'search', href: '/search' },
  { key: 'settings', href: '/settings' },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]['key'];

export const PHONE_TABS: readonly NavKey[] = ['home', 'live', 'guide', 'movies'];
export const PHONE_MORE: readonly NavKey[] = ['series', 'catchup', 'search', 'settings'];

/** Which nav item a pathname belongs to ("/live/123" → "live"). */
export function navKeyForPath(pathname: string): NavKey | 'more' {
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  if (first === 'more') return 'more';
  return NAV_ITEMS.find((item) => item.href === `/${first}`)?.key ?? 'home';
}
