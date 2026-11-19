import { describe, expect, it } from 'vitest';
import { formatClock, isFinished, movieSeekStep, movieStreamUrl, parseVodInfo, resumeAt, splitTitle, youtubeId } from './vod';

const login = { server: 'http://tv.example:8080', username: 'me', password: 'p@ss' };

describe('movie details (get_vod_info)', () => {
  it('reads a typical XUI answer', () => {
    const info = parseVodInfo({
      info: {
        name: 'Nightwish (2018)',
        movie_image: 'http://img/poster.jpg',
        cover_big: 'http://img/big.jpg',
        backdrop_path: ['http://img/back.jpg'],
        releasedate: '2018-08-11',
        episode_run_time: 81,
        duration_secs: 5171,
        duration: '01:26:11',
        youtube_trailer: '',
        director: '',
        actors: 'Floor Jansen, Marco Hietala',
        plot: 'A festival show.',
        genre: 'Music',
        rating: '8',
      },
      movie_data: { stream_id: 161620, container_extension: 'mp4' },
    });
    expect(info).toMatchObject({
      plot: 'A festival show.',
      cast: 'Floor Jansen, Marco Hietala',
      director: null,
      genre: 'Music',
      year: 2018,
      rating: 8,
      durationMs: 5171_000,
      poster: 'http://img/poster.jpg',
      backdrop: 'http://img/back.jpg',
      trailer: null,
      ext: 'mp4',
    });
  });

  it('copes with empty, string and odd values', () => {
    expect(parseVodInfo(null)).toMatchObject({ plot: null, year: null, rating: null, durationMs: null, backdrop: null });
    const info = parseVodInfo({ info: { description: 'From description', duration: '42:05', rating: 0, backdrop_path: 'http://img/b.jpg', youtube_trailer: 'dQw4w9WgXcQ' }, movie_data: { year: '1999' } });
    expect(info).toMatchObject({ plot: 'From description', durationMs: (42 * 60 + 5) * 1000, rating: null, backdrop: 'http://img/b.jpg', trailer: 'dQw4w9WgXcQ', year: 1999 });
    expect(parseVodInfo({ info: { episode_run_time: '95' } }).durationMs).toBe(95 * 60_000);
    expect(parseVodInfo({ info: { director: 'Iva R., Iva R. , iva r.', cast: 'A, B, A' } })).toMatchObject({ director: 'Iva R.', cast: 'A, B' });
  });

  it('finds YouTube ids in ids and links only', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('http://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeId('')).toBeNull();
    expect(youtubeId(null)).toBeNull();
  });
});

describe('movie links and titles', () => {
  it('builds the Xtream movie link with the container extension', () => {
    expect(movieStreamUrl({ id: '277483', url: null, ext: 'mkv' }, login)).toBe('http://tv.example:8080/movie/me/p%40ss/277483.mkv');
    expect(movieStreamUrl({ id: '1', url: null, ext: 'Mp4' }, login)).toMatch(/\/1\.mp4$/);
    expect(movieStreamUrl({ id: '1', url: null, ext: null }, login)).toMatch(/\/1\.mp4$/);
    expect(movieStreamUrl({ id: '1', url: 'http://m3u/film.mkv', ext: null }, null)).toBe('http://m3u/film.mkv');
    expect(movieStreamUrl({ id: '1', url: null, ext: 'mp4' }, null)).toBeNull();
  });

  it('splits the year off the name', () => {
    expect(splitTitle('An Honest Life (2025)')).toEqual({ title: 'An Honest Life', year: 2025 });
    expect(splitTitle('Alien [1979]')).toEqual({ title: 'Alien', year: 1979 });
    expect(splitTitle('Dune - 2021')).toEqual({ title: 'Dune', year: 2021 });
    expect(splitTitle('Heartland (2026) (2026)')).toEqual({ title: 'Heartland', year: 2026 });
    expect(splitTitle('2001: A Space Odyssey')).toEqual({ title: '2001: A Space Odyssey', year: null });
    expect(splitTitle('Blade Runner 2049')).toEqual({ title: 'Blade Runner 2049', year: null });
  });
});

describe('resume', () => {
  const hour = 3_600_000;
  it('resumes after the first minute and before the credits', () => {
    expect(resumeAt(null)).toBeNull();
    expect(resumeAt({ positionMs: 30_000, durationMs: 2 * hour, watched: false })).toBeNull();
    expect(resumeAt({ positionMs: hour, durationMs: 2 * hour, watched: false })).toBe(hour);
    expect(resumeAt({ positionMs: hour, durationMs: null, watched: false })).toBe(hour);
    expect(resumeAt({ positionMs: 2 * hour - 60_000, durationMs: 2 * hour, watched: false })).toBeNull();
    expect(resumeAt({ positionMs: hour, durationMs: 2 * hour, watched: true })).toBeNull();
  });

  it('counts the last minutes as finished', () => {
    expect(isFinished(2 * hour - 3 * 60_000, 2 * hour)).toBe(true);
    expect(isFinished(hour, 2 * hour)).toBe(false);
    // A short clip: 4 minutes left is most of it, not the credits.
    expect(isFinished(60_000, 5 * 60_000)).toBe(false);
    expect(isFinished(hour, null)).toBe(false);
  });

  it('seeks in growing steps and formats clock times', () => {
    expect([0, 2, 3, 5, 6, 9, 10].map(movieSeekStep)).toEqual([10_000, 10_000, 30_000, 30_000, 60_000, 60_000, 300_000]);
    expect(formatClock(3_733_000)).toBe('1:02:13');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});
