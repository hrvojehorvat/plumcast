import { canReplay } from '../core/catchup';
import { isSearchable, orderProgrammeHits } from '../core/search';
import { useGuideVersion } from '../data/guide';
import { ALL, listChannels, searchProgrammes, useLiveVersion, type AiredItem, type Channel } from '../data/live';
import { listMovies, useMoviesVersion, type MovieItem } from '../data/movies';
import type { Playlist } from '../data/playlists';
import { usePrefs } from '../data/prefs';
import { listSeries, useSeriesVersion, type SeriesItem } from '../data/series';
import { useQuery } from '../ui/useQuery';

const PER_TYPE = 40;
const DAY = 24 * 3_600_000;
/** The guide is searched from a week back (replays) to a week ahead. */
const BACK = 7 * DAY;
const AHEAD = 7 * DAY;

export interface SearchResults {
  channels: Channel[];
  movies: MovieItem[];
  series: SeriesItem[];
  programmes: AiredItem[];
}

export const isEmpty = (r: SearchResults) => !r.channels.length && !r.movies.length && !r.series.length && !r.programmes.length;

/**
 * Full search across channels, movies, series and the stored TV guide. Past programmes are
 * kept only where they can be replayed; times follow the guide time offset.
 */
export function useFullSearch(playlist: Playlist | null, query: string): SearchResults | undefined {
  const { epgOffsetHours } = usePrefs();
  const guideVersion = useGuideVersion(playlist?.id ?? -1);
  const version = `${useLiveVersion()}|${useMoviesVersion()}|${useSeriesVersion()}|${guideVersion}`;
  const text = query.trim();
  const key = playlist && isSearchable(text) ? `${playlist.id}|${playlist.syncedAt ?? 0}|${epgOffsetHours}|${text}` : null;
  return useQuery(
    key,
    async () => {
      const id = playlist!.id;
      const now = Date.now();
      const shift = epgOffsetHours * 3_600_000;
      const [channels, movies, series, aired] = await Promise.all([
        listChannels(id, ALL, text, false, PER_TYPE),
        listMovies(id, ALL, text, 'az', PER_TYPE),
        listSeries(id, ALL, text, 'az', PER_TYPE),
        searchProgrammes(id, text, now - BACK - shift, now + AHEAD - shift, now - shift),
      ]).catch((error: unknown) => {
        console.warn('Search failed', error);
        throw error;
      });
      const shifted = aired.map((a) => ({ ...a, programme: { ...a.programme, start: a.programme.start + shift, end: a.programme.end + shift } }));
      const useful = shifted.filter((a) => a.programme.end > now || canReplay(a.channel, a.programme, now));
      return { channels, movies, series, programmes: orderProgrammeHits(useful, now).slice(0, PER_TYPE) };
    },
    version,
  );
}
