import { useEffect, useState } from 'react';
import { liveStreamUrl } from '../core/streams';
import { usePrefs } from '../data/prefs';
import {
  ALL,
  FAVORITES,
  RECENT,
  countFavoritesAndRecents,
  listChannels,
  listLiveCategories,
  useLiveVersion,
  type Channel,
} from '../data/live';
import type { Playlist } from '../data/playlists';
import { loginFor } from '../data/session';
import { useI18n } from '../ui/i18n';
import { useQuery } from '../ui/useQuery';

export interface CategoryItem {
  id: string;
  name: string;
  count: number | null;
}

/** Built-in lists first (favourites, recent, all), then the provider's categories in the user's order. */
export function useLiveCategories(playlist: Playlist | null): CategoryItem[] | null {
  const { t } = useI18n();
  const version = useLiveVersion();
  const total = playlist?.counts?.live ?? null;
  const key = playlist ? `${playlist.id}|${playlist.syncedAt ?? 0}` : null;
  const data = useQuery(
    key,
    async () => {
      const id = playlist!.id;
      const [categories, counts] = await Promise.all([listLiveCategories(id), countFavoritesAndRecents(id)]);
      return { categories, counts };
    },
    version,
  );
  if (!data) return null;
  return [
    { id: FAVORITES, name: t('live.favorites'), count: data.counts.favorites },
    { id: RECENT, name: t('live.recent'), count: data.counts.recent },
    { id: ALL, name: t('live.all'), count: total },
    ...data.categories.map((c) => ({ id: c.id, name: c.name, count: c.count })),
  ];
}

/** Channels of one list, re-queried when the search text, favourites or the catalog change. */
export function useChannels(playlist: Playlist | null, categoryId: string | null, query: string): Channel[] | null {
  const version = useLiveVersion();
  const key = playlist && categoryId ? `${playlist.id}|${playlist.syncedAt ?? 0}|${categoryId}|${query}` : null;
  return useQuery(key, () => listChannels(playlist!.id, categoryId!, query), version) ?? null;
}

/**
 * Playable URL for a channel (needs the Xtream login from secure storage).
 * undefined while loading, null when the channel can't be played.
 */
export function useStreamUrl(playlist: Playlist | null, channel: Channel | null): string | null | undefined {
  const { streamFormat } = usePrefs();
  const key = playlist && channel ? `${playlist.id}|${playlist.syncedAt ?? 0}|${channel.id}|${streamFormat}` : null;
  return useQuery(key, async () => liveStreamUrl(channel!, await loginFor(playlist!), streamFormat));
}

/** `value`, but only after it stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** First list to show: favourites if there are any, else the first provider category, else all. */
export function defaultCategory(items: readonly CategoryItem[]): string {
  const favs = items.find((c) => c.id === FAVORITES);
  if (favs?.count) return FAVORITES;
  return items.find((c) => c.id !== FAVORITES && c.id !== RECENT && c.id !== ALL)?.id ?? ALL;
}
