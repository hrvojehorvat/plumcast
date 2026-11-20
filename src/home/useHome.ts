import { continueOrder } from '../data/home';
import { FAVORITES, listChannels, useLiveVersion, type Channel } from '../data/live';
import { ALL, CONTINUE, listMovies, useMoviesVersion, type MovieItem } from '../data/movies';
import type { Playlist } from '../data/playlists';
import { listSeries, useSeriesVersion, type SeriesItem } from '../data/series';
import { useQuery } from '../ui/useQuery';

const ROW = 20;

export type ContinueItem = { kind: 'movie'; movie: MovieItem } | { kind: 'series'; series: SeriesItem };

export interface HomeRows {
  continuing: ContinueItem[];
  channels: Channel[];
  movies: MovieItem[];
  series: SeriesItem[];
}

/** Home's rows for the active playlist; they refresh when progress or favourites change. */
export function useHomeRows(playlist: Playlist): HomeRows | undefined {
  const version = `${useMoviesVersion()}|${useSeriesVersion()}|${useLiveVersion()}`;
  return useQuery(
    `${playlist.id}|${playlist.syncedAt ?? 0}`,
    async () => {
      const id = playlist.id;
      const [order, continuingMovies, continuingSeries, channels, movies, series] = await Promise.all([
        continueOrder(id, ROW),
        listMovies(id, CONTINUE, '', 'recent', ROW),
        listSeries(id, CONTINUE, '', 'recent', ROW),
        listChannels(id, FAVORITES, '', false, 40),
        listMovies(id, ALL, '', 'recent', ROW),
        listSeries(id, ALL, '', 'recent', ROW),
      ]);
      const movieById = new Map(continuingMovies.map((m) => [m.id, m]));
      const seriesById = new Map(continuingSeries.map((s) => [s.id, s]));
      const continuing: ContinueItem[] = [];
      for (const key of order) {
        const movie = key.kind === 'movie' ? movieById.get(key.id) : undefined;
        const show = key.kind === 'series' ? seriesById.get(key.id) : undefined;
        if (movie) continuing.push({ kind: 'movie', movie });
        else if (show) continuing.push({ kind: 'series', series: show });
      }
      return { continuing, channels, movies, series };
    },
    version,
  );
}
