import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, PHONE_MORE, PHONE_TABS, navKeyForPath } from './nav';

describe('nav', () => {
  it('keeps the agreed menu order', () => {
    expect(NAV_ITEMS.map((i) => i.key)).toEqual([
      'home', 'live', 'movies', 'series', 'catchup', 'guide', 'search', 'settings',
    ]);
  });

  it('sets search and settings apart from the watching sections', () => {
    expect(NAV_ITEMS.filter((i) => i.tool).map((i) => i.key)).toEqual(['search', 'settings']);
  });

  it('puts every item either in a phone tab or under More', () => {
    expect([...PHONE_TABS, ...PHONE_MORE]).toEqual(NAV_ITEMS.map((i) => i.key));
  });

  it('maps paths to nav items', () => {
    expect(navKeyForPath('/')).toBe('home');
    expect(navKeyForPath('/live')).toBe('live');
    expect(navKeyForPath('/catchup/42/2026-11-17')).toBe('catchup');
    expect(navKeyForPath('/more')).toBe('more');
    expect(navKeyForPath('/unknown')).toBe('home');
  });

  it('puts the playlist pages under Settings', () => {
    expect(navKeyForPath('/playlists/add')).toBe('settings');
    expect(navKeyForPath('/playlists/3')).toBe('settings');
  });
});
