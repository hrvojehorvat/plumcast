import type { CatalogCategory, CatalogSort } from '../catalog/CatalogScreen';
import type { Playlist } from '../data/playlists';
import { ALL, CONTINUE, FAVORITES, countSeriesLists, listSeries, listSeriesCategories, useSeriesVersion, type SeriesItem } from '../data/series';
import { useI18n } from '../ui/i18n';
import { useQuery } from '../ui/useQuery';

/** Continue watching and favourites, all series, then the provider's categories. */
export function useSeriesCategories(playlist: Playlist | null): CatalogCategory[] | null {
  const { t } = useI18n();
  const version = useSeriesVersion();
  const key = playlist ? `${playlist.id}|${playlist.syncedAt ?? 0}` : null;
  const data = useQuery(
    key,
    async () => {
      const [categories, counts] = await Promise.all([listSeriesCategories(playlist!.id), countSeriesLists(playlist!.id)]);
      return { categories, counts };
    },
    version,
  );
  if (!data) return null;
  return [
    { id: CONTINUE, name: t('series.continue'), count: data.counts.continuing },
    { id: FAVORITES, name: t('series.favorites'), count: data.counts.favorites },
    { id: ALL, name: t('series.all'), count: playlist?.counts?.series ?? null },
    ...data.categories.filter((c) => c.count > 0),
  ];
}

export function useSeriesList(playlist: Playlist | null, categoryId: string | null, query: string, sort: CatalogSort): SeriesItem[] | null {
  const version = useSeriesVersion();
  const key = playlist && categoryId ? `${playlist.id}|${playlist.syncedAt ?? 0}|${categoryId}|${query}|${sort}` : null;
  return useQuery(key, () => listSeries(playlist!.id, categoryId!, query, sort), version) ?? null;
}
