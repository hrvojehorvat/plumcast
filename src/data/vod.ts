import { getJson } from '../core/http';
import { movieStreamUrl, parseVodInfo, type MovieInfo } from '../core/vod';
import { episodeStreamUrl, parseSeriesInfo, seasonsFromStored, type Episode, type SeriesInfo } from '../core/series';
import { apiUrl } from '../core/xtream';
import { useQuery } from '../ui/useQuery';
import type { MovieItem } from './movies';
import { appFetch } from './net';
import type { Playlist } from './playlists';
import { listStoredEpisodes, type SeriesItem } from './series';
import { loginFor } from './session';

/** Details are fetched when a movie is opened and kept for the app run. */
const infos = new Map<string, Promise<MovieInfo | null>>();

function movieInfo(playlist: Playlist, id: string): Promise<MovieInfo | null> {
  const key = `${playlist.id}:${playlist.syncedAt ?? 0}:${id}`;
  let hit = infos.get(key);
  if (!hit) {
    hit = (async () => {
      const login = await loginFor(playlist);
      if (!login) return null;
      return parseVodInfo(await getJson(appFetch, apiUrl(login, 'get_vod_info', { vod_id: id }), { timeoutMs: 20_000 }));
    })();
    infos.set(key, hit);
    // A failed request is asked again next time.
    hit.catch((error: unknown) => {
      infos.delete(key);
      console.warn('[movies] details failed', error instanceof Error ? error.message : error);
    });
  }
  return hit;
}

/**
 * The provider's details for a movie: undefined while loading, null when there are none
 * (M3U lists, or the request failed: the page then shows what the list has).
 */
export function useMovieInfo(playlist: Playlist | null, id: string | null): MovieInfo | null | undefined {
  const key = playlist && id ? `${playlist.id}|${playlist.syncedAt ?? 0}|${id}` : null;
  return useQuery(key, () => movieInfo(playlist!, id!).catch(() => null));
}

/** Playable link of a movie (null when it can't be built). */
export async function movieUrl(playlist: Playlist, movie: Pick<MovieItem, 'id' | 'url' | 'ext'>): Promise<string | null> {
  return movieStreamUrl(movie, movie.url ? null : await loginFor(playlist));
}

// ---- series ----

/** Seasons and details per series, kept for the app run like movie details. */
const seriesInfos = new Map<string, Promise<SeriesInfo | null>>();

function seriesInfo(playlist: Playlist, series: Pick<SeriesItem, 'id' | 'name'>): Promise<SeriesInfo | null> {
  const key = `${playlist.id}:${playlist.syncedAt ?? 0}:${series.id}`;
  let hit = seriesInfos.get(key);
  if (!hit) {
    hit = (async () => {
      if (playlist.kind !== 'xtream') {
        const seasons = seasonsFromStored(await listStoredEpisodes(playlist.id, series.id));
        return { plot: null, cast: null, director: null, genre: null, year: null, rating: null, cover: null, backdrop: null, trailer: null, seasons };
      }
      const login = await loginFor(playlist);
      if (!login) return null;
      const json = await getJson(appFetch, apiUrl(login, 'get_series_info', { series_id: series.id }), { timeoutMs: 20_000 });
      return parseSeriesInfo(json, series.name);
    })();
    seriesInfos.set(key, hit);
    hit.catch((error: unknown) => {
      seriesInfos.delete(key);
      console.warn('[series] details failed', error instanceof Error ? error.message : error);
    });
  }
  return hit;
}

/** Seasons, episodes and details of a series: undefined while loading, null when they couldn't be loaded. */
export function useSeriesInfo(playlist: Playlist | null, series: Pick<SeriesItem, 'id' | 'name'> | null): SeriesInfo | null | undefined {
  const key = playlist && series ? `${playlist.id}|${playlist.syncedAt ?? 0}|${series.id}` : null;
  return useQuery(key, () => seriesInfo(playlist!, series!).catch(() => null));
}

/** Playable link of an episode (null when it can't be built). */
export async function episodeUrl(playlist: Playlist, episode: Pick<Episode, 'id' | 'url' | 'ext'>): Promise<string | null> {
  return episodeStreamUrl(episode, episode.url ? null : await loginFor(playlist));
}
