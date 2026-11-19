import type { CatalogCategory } from '../catalog/CatalogScreen';
import { splitTitle } from '../core/vod';
import { ALL, CONTINUE, FAVORITES, countMovieLists, listMovieCategories, listMovies, useMoviesVersion, type MovieItem, type MovieSort } from '../data/movies';
import type { Playlist } from '../data/playlists';
import { useI18n } from '../ui/i18n';
import { useQuery } from '../ui/useQuery';

/** Continue watching and favourites (when they have something), all movies, then the provider's categories. */
export function useMovieCategories(playlist: Playlist | null): CatalogCategory[] | null {
  const { t } = useI18n();
  const version = useMoviesVersion();
  const key = playlist ? `${playlist.id}|${playlist.syncedAt ?? 0}` : null;
  const data = useQuery(
    key,
    async () => {
      const [categories, counts] = await Promise.all([listMovieCategories(playlist!.id), countMovieLists(playlist!.id)]);
      return { categories, counts };
    },
    version,
  );
  if (!data) return null;
  return [
    { id: CONTINUE, name: t('movies.continue'), count: data.counts.continuing },
    { id: FAVORITES, name: t('movies.favorites'), count: data.counts.favorites },
    { id: ALL, name: t('movies.all'), count: playlist?.counts?.movies ?? null },
    ...data.categories.filter((c) => c.count > 0),
  ];
}

export function useMovieList(playlist: Playlist | null, categoryId: string | null, query: string, sort: MovieSort): MovieItem[] | null {
  const version = useMoviesVersion();
  const key = playlist && categoryId ? `${playlist.id}|${playlist.syncedAt ?? 0}|${categoryId}|${query}|${sort}` : null;
  return useQuery(key, () => listMovies(playlist!.id, categoryId!, query, sort), version) ?? null;
}

/** Display title and year (from the name, or the details when the name has none). */
export function movieTitle(name: string, year: number | null = null): { title: string; year: number | null } {
  const split = splitTitle(name);
  return { title: split.title, year: split.year ?? year };
}
