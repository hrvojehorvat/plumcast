import { useMemo } from 'react';
import type { Programme } from '../core/epg';
import { addDays, dayStart } from '../core/guide';
import { ALL, FAVORITES, countArchiveChannels, listArchiveCategories, listChannels, useLiveVersion, type Channel } from '../data/live';
import type { Playlist } from '../data/playlists';
import type { CategoryItem } from '../live/useLive';
import { useI18n } from '../ui/i18n';
import { useQuery } from '../ui/useQuery';

/** The "Recently aired" list: newest programmes across all catch-up channels. */
export const AIRED = ':aired';

/** Lists in the Catch-up section: recently aired, favourites (if any), all, then categories with catch-up channels. */
export function useArchiveCategories(playlist: Playlist | null): CategoryItem[] | null {
  const { t } = useI18n();
  const version = useLiveVersion();
  const key = playlist ? `${playlist.id}|${playlist.syncedAt ?? 0}` : null;
  const data = useQuery(
    key,
    async () => {
      const [categories, counts] = await Promise.all([listArchiveCategories(playlist!.id), countArchiveChannels(playlist!.id)]);
      return { categories, counts };
    },
    version,
  );
  if (!data) return null;
  return [
    { id: AIRED, name: t('catchup.recent'), count: null },
    ...(data.counts.favorites ? [{ id: FAVORITES, name: t('live.favorites'), count: data.counts.favorites }] : []),
    { id: ALL, name: t('catchup.allChannels'), count: data.counts.all },
    ...data.categories.map((c) => ({ id: c.id, name: c.name, count: c.count })),
  ];
}

/** Catch-up channels of one list, filtered by a search text inside that list. */
export function useArchiveChannels(playlist: Playlist | null, categoryId: string | null, query: string): Channel[] | null {
  const version = useLiveVersion();
  const key = playlist && categoryId && categoryId !== AIRED ? `${playlist.id}|${playlist.syncedAt ?? 0}|${categoryId}|${query}` : null;
  return useQuery(key, () => listChannels(playlist!.id, categoryId!, query, true), version) ?? null;
}

/** Days that have replays, newest first. */
export function archiveDays(programmes: readonly Programme[]): number[] {
  const days = new Set<number>();
  for (const p of programmes) days.add(dayStart(p.start));
  return [...days].sort((a, b) => b - a);
}

export function useArchiveDays(programmes: readonly Programme[] | undefined): number[] {
  return useMemo(() => archiveDays(programmes ?? []), [programmes]);
}

/** "Today", "Yesterday" or a short date. */
export function dayLabel(day: number, today: number, t: ReturnType<typeof useI18n>['t'], format: (ms: number) => string): string {
  if (day === today) return t('guide.today');
  if (day === addDays(today, -1)) return t('catchup.yesterday');
  return format(day);
}
