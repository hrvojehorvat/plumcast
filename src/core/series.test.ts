import { describe, expect, it } from 'vitest';
import {
  episodeCode,
  episodeStreamUrl,
  episodeTitle,
  nextEpisode,
  parseSeriesInfo,
  pickEpisode,
  seasonsFromStored,
  type EpisodeProgress,
} from './series';

const login = { server: 'http://tv.example:8080', username: 'me', password: 'p@ss' };

const ep = (id: string, season: number, num: number, extra: Record<string, unknown> = {}) => ({
  id,
  episode_num: String(num),
  title: `Show - S${String(season).padStart(2, '0')}E${String(num).padStart(2, '0')} -`,
  container_extension: 'mkv',
  season,
  info: { duration_secs: 2700, movie_image: `http://img/${id}.jpg`, plot: `Plot ${id}` },
  ...extra,
});

describe('episode titles', () => {
  it('drops the show name and the code', () => {
    expect(episodeTitle('Senke Nad Balkanom - S01E01 -', 'Senke Nad Balkanom')).toBeNull();
    expect(episodeTitle('Show - S01E02 - Pilot', 'Show')).toBe('Pilot');
    expect(episodeTitle('S02 E05 The Return', 'Show')).toBe('The Return');
    expect(episodeTitle('Episode 3', 'Show')).toBeNull();
    expect(episodeTitle('', 'Show')).toBeNull();
    expect(episodeTitle('A (Remix)', 'A (')).toBe('Remix)');
  });

  it('reads codes', () => {
    expect(episodeCode('Show S1E2')).toEqual({ season: 1, number: 2 });
    expect(episodeCode('Show - S03 E10 -')).toEqual({ season: 3, number: 10 });
    expect(episodeCode('Show')).toBeNull();
  });
});

describe('series details (get_series_info)', () => {
  it('builds seasons from the episodes, specials last', () => {
    const info = parseSeriesInfo(
      {
        seasons: [{ season_number: 0, name: 'Specials' }, { season_number: 2, name: 'Season Two' }],
        info: { plot: 'About', cast: 'A, B, A', director: '', genre: 'Drama', releaseDate: '2019-02-01', rating: '7.4', backdrop_path: ['http://img/b.jpg'], youtube_trailer: 'dQw4w9WgXcQ' },
        episodes: { '2': [ep('21', 2, 1)], '1': [ep('12', 1, 2), ep('11', 1, 1)], '0': [ep('01', 0, 1)] },
      },
      'Show',
    );
    expect(info.seasons.map((s) => s.number)).toEqual([1, 2, 0]);
    expect(info.seasons[0].episodes.map((e) => e.id)).toEqual(['11', '12']);
    expect(info.seasons[1].name).toBe('Season Two');
    expect(info.seasons[0].episodes[0]).toMatchObject({ title: null, durationMs: 2_700_000, ext: 'mkv', image: 'http://img/11.jpg', plot: 'Plot 11' });
    expect(info).toMatchObject({ plot: 'About', cast: 'A, B', director: null, year: 2019, rating: 7.4, backdrop: 'http://img/b.jpg', trailer: 'dQw4w9WgXcQ' });
  });

  it('copes with an empty season list, array episodes and junk', () => {
    const info = parseSeriesInfo({ seasons: [], info: [], episodes: [[ep('a', 1, 1), { id: '' }, ep('a', 1, 1)]] }, 'Show');
    expect(info.seasons).toHaveLength(1);
    expect(info.seasons[0].episodes).toHaveLength(1);
    expect(parseSeriesInfo(null, 'x').seasons).toEqual([]);
  });

  it('falls back to the group key and the code for numbers', () => {
    const info = parseSeriesInfo({ episodes: { '3': [{ id: 'x', title: 'Show S03E07' }] } }, 'Show');
    expect(info.seasons[0].episodes[0]).toMatchObject({ season: 3, number: 7 });
  });
});

describe('M3U seasons', () => {
  it('groups stored episodes', () => {
    const seasons = seasonsFromStored([
      { seriesId: 's', id: 'b', season: 1, number: 2, title: null, url: 'http://x/b.mp4', image: null },
      { seriesId: 's', id: 'a', season: 1, number: 1, title: 'One', url: 'http://x/a.mp4', image: null },
      { seriesId: 's', id: 'c', season: 2, number: 1, title: null, url: 'http://x/c.mp4', image: null },
    ]);
    expect(seasons.map((s) => s.episodes.map((e) => e.id))).toEqual([['a', 'b'], ['c']]);
    expect(episodeStreamUrl(seasons[0].episodes[0], login)).toBe('http://x/a.mp4');
  });
});

describe('episode links and order', () => {
  const seasons = parseSeriesInfo({ episodes: { '1': [ep('11', 1, 1), ep('12', 1, 2)], '2': [ep('21', 2, 1)] } }, 'Show').seasons;

  it('builds the Xtream link', () => {
    expect(episodeStreamUrl(seasons[0].episodes[0], login)).toBe('http://tv.example:8080/series/me/p%40ss/11.mkv');
    expect(episodeStreamUrl({ id: '9', url: null, ext: null }, login)).toBe('http://tv.example:8080/series/me/p%40ss/9.mp4');
    expect(episodeStreamUrl({ id: '9', url: null, ext: null }, null)).toBeNull();
  });

  it('finds the next episode across seasons', () => {
    expect(nextEpisode(seasons, '12')?.id).toBe('21');
    expect(nextEpisode(seasons, '21')).toBeNull();
    expect(nextEpisode(seasons, 'nope')).toBeNull();
  });

  it('picks what Play starts', () => {
    const progress = new Map<string, EpisodeProgress>();
    expect(pickEpisode(seasons, null, progress)).toEqual({ episode: seasons[0].episodes[0], resumeMs: null });
    progress.set('12', { positionMs: 600_000, durationMs: 2_700_000, watched: false });
    expect(pickEpisode(seasons, '12', progress)).toMatchObject({ episode: { id: '12' }, resumeMs: 600_000 });
    progress.set('12', { positionMs: 2_650_000, durationMs: 2_700_000, watched: false });
    expect(pickEpisode(seasons, '12', progress)?.episode.id).toBe('21');
    progress.set('11', { positionMs: 0, durationMs: null, watched: true });
    progress.set('21', { positionMs: 0, durationMs: null, watched: true });
    // Last one finished, nothing after it: first unwatched.
    expect(pickEpisode(seasons, '21', progress)?.episode.id).toBe('12');
    expect(pickEpisode([], null, progress)).toBeNull();
  });
});
