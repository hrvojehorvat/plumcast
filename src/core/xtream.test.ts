import { describe, expect, it } from 'vitest';
import { PlaylistError } from './errors';
import type { FetchLike } from './http';
import {
  apiUrl,
  assertUsable,
  fetchXtreamCatalog,
  normalizeServer,
  parseAccount,
  parseCategories,
  parseLiveStreams,
  parseMovies,
  parseSeries,
  parseXtreamLink,
} from './xtream';

const login = { server: 'http://tv.example:8080', username: 'me', password: 'p&ss word' };

describe('normalizeServer', () => {
  it('adds http, drops trailing slashes and pasted endpoints', () => {
    expect(normalizeServer('tv.example:8080/')).toBe('http://tv.example:8080');
    expect(normalizeServer(' HTTPS://tv.example ')).toBe('https://tv.example');
    expect(normalizeServer('http://tv.example:8080/player_api.php?username=a')).toBe('http://tv.example:8080');
    expect(normalizeServer('http://tv.example/sub/path/get.php')).toBe('http://tv.example/sub/path');
  });

  it('rejects empty and non-http input', () => {
    expect(normalizeServer('')).toBeNull();
    expect(normalizeServer('ftp://tv.example')).toBeNull();
  });
});

describe('parseXtreamLink', () => {
  it('pulls server and login out of a pasted M3U link', () => {
    expect(parseXtreamLink('http://tv.example:8080/get.php?username=me&password=s%26cret&type=m3u_plus')).toEqual({
      server: 'http://tv.example:8080',
      username: 'me',
      password: 's&cret',
    });
  });

  it('works for a bare server too', () => {
    expect(parseXtreamLink('tv.example')).toEqual({ server: 'http://tv.example', username: undefined, password: undefined });
  });
});

describe('apiUrl', () => {
  it('encodes the login and adds the action', () => {
    expect(apiUrl(login, 'get_live_streams', { category_id: 5 })).toBe(
      'http://tv.example:8080/player_api.php?username=me&password=p%26ss%20word&action=get_live_streams&category_id=5',
    );
  });
});

describe('account', () => {
  const ok = {
    user_info: { auth: 1, status: 'Active', exp_date: '1893456000', is_trial: '0', active_cons: '1', max_connections: '2', allowed_output_formats: ['m3u8', 'ts'] },
    server_info: { timezone: 'Europe/Berlin' },
  };

  it('parses user_info with string numbers', () => {
    expect(parseAccount(ok)).toEqual({
      status: 'Active',
      expiresAt: 1893456000000,
      isTrial: false,
      activeConnections: 1,
      maxConnections: 2,
      allowedFormats: ['m3u8', 'ts'],
      serverTimezone: 'Europe/Berlin',
    });
  });

  it('treats a null exp_date as never expiring', () => {
    expect(parseAccount({ user_info: { ...ok.user_info, exp_date: null } }).expiresAt).toBeNull();
  });

  it('rejects wrong credentials', () => {
    expect(() => parseAccount({ user_info: { auth: 0 } })).toThrow(PlaylistError);
    expect(() => parseAccount([])).toThrow(/Wrong username/);
  });

  it('rejects expired and banned accounts', () => {
    const account = parseAccount(ok);
    expect(() => assertUsable({ ...account, status: 'Expired' })).toThrow(expect.objectContaining({ code: 'expired' }));
    expect(() => assertUsable({ ...account, expiresAt: 1000 }, 2000)).toThrow(expect.objectContaining({ code: 'expired' }));
    expect(() => assertUsable({ ...account, status: 'Banned' })).toThrow(expect.objectContaining({ code: 'blocked' }));
    expect(() => assertUsable(account, 0)).not.toThrow();
  });
});

describe('parsers', () => {
  it('reads categories and skips broken rows', () => {
    expect(parseCategories([{ category_id: '1', category_name: 'DE | News' }, { category_name: 'no id' }], 'live')).toEqual([
      { kind: 'live', id: '1', name: 'DE | News' },
    ]);
    expect(parseCategories(null, 'movie')).toEqual([]);
  });

  it('reads live streams with archive info', () => {
    const [ch, noArchive] = parseLiveStreams([
      { num: '3', name: 'Adria 1', stream_id: 101, stream_icon: '', category_id: '1', epg_channel_id: 'adria1.hr', tv_archive: 1, tv_archive_duration: '7' },
      { name: 'Kino', stream_id: '102', category_ids: [4], tv_archive: 0, tv_archive_duration: 3 },
    ]);
    expect(ch).toEqual({
      id: '101', num: 3, name: 'Adria 1', logo: null, categoryId: '1', epgId: 'adria1.hr', archive: true, archiveDays: 7, url: null, catchup: null,
    });
    expect(noArchive).toMatchObject({ id: '102', categoryId: '4', archive: false, archiveDays: 0 });
  });

  it('reads movies and series', () => {
    expect(parseMovies([{ stream_id: 5, name: 'Film', container_extension: 'mkv', rating_5based: 3.5, added: '1700000000', category_id: 9 }])[0]).toMatchObject({
      id: '5', ext: 'mkv', rating: 7, addedAt: 1700000000000, categoryId: '9',
    });
    expect(parseSeries({ 0: { series_id: 8, name: 'Show', releaseDate: '2021-05-01', rating: '8.1' } })[0]).toMatchObject({
      id: '8', name: 'Show', year: 2021, rating: 8.1,
    });
  });
});

describe('fetchXtreamCatalog', () => {
  const responses: Record<string, unknown> = {
    '': { user_info: { auth: 1, status: 'Active', exp_date: null } },
    get_live_categories: [{ category_id: '1', category_name: 'News' }],
    get_live_streams: [{ stream_id: 1, name: 'A' }, { stream_id: 2, name: 'B' }],
    get_vod_categories: [],
    get_vod_streams: [{ stream_id: 3, name: 'M' }],
    get_series_categories: [{ category_id: '7', category_name: 'Drama' }],
    get_series: [],
  };
  const fake: FetchLike = async (url) => {
    const action = /action=([a-z_]+)/.exec(url)?.[1] ?? '';
    return { ok: true, status: 200, text: async () => JSON.stringify(responses[action]) };
  };

  it('downloads everything and reports each step', async () => {
    const steps: string[] = [];
    const catalog = await fetchXtreamCatalog(login, fake, { onStep: (s) => steps.push(s) });
    expect(steps).toEqual(['account', 'liveCategories', 'live', 'movieCategories', 'movies', 'seriesCategories', 'series']);
    expect(catalog.live.map((c) => c.id)).toEqual(['1', '2']);
    expect(catalog.movies).toHaveLength(1);
    expect(catalog.categories.map((c) => `${c.kind}:${c.id}`)).toEqual(['live:1', 'series:7']);
    expect(catalog.epgUrl).toBe('http://tv.example:8080/xmltv.php?username=me&password=p%26ss%20word');
  });

  it('maps HTTP and network failures to error codes', async () => {
    const forbidden: FetchLike = async () => ({ ok: false, status: 403, text: async () => '' });
    await expect(fetchXtreamCatalog(login, forbidden)).rejects.toMatchObject({ code: 'auth' });
    const html: FetchLike = async () => ({ ok: true, status: 200, text: async () => '<html>' });
    await expect(fetchXtreamCatalog(login, html)).rejects.toMatchObject({ code: 'format' });
    const offline: FetchLike = async () => { throw new TypeError('Failed to fetch'); };
    await expect(fetchXtreamCatalog(login, offline)).rejects.toMatchObject({ code: 'network' });
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const hang: FetchLike = (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    await expect(fetchXtreamCatalog(login, hang, { signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
  });
});
