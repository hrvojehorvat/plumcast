import { describe, expect, it } from 'vitest';
import { classifyEntry, m3uToCatalog, parseM3u } from './m3u';

const SAMPLE = `﻿#EXTM3U url-tvg="http://epg.example/guide.xml,http://other/epg.xml" catchup="default" catchup-days="5"
#EXTINF:-1 tvg-id="adria1.hr" tvg-chno="3" tvg-logo="http://img/a1.png" group-title="HR | News, Info",Adria 1, HD
http://tv.example/live/u/p/101.ts
#EXTINF:-1 tvg-id="alpen.at" catchup="flussonic" catchup-days="0" group-title="AT",Alpen TV
http://tv.example/live/u/p/102.ts

#EXTINF:-1 tvg-name="Plain"
#EXTGRP:Misc
#EXTVLCOPT:http-user-agent=Foo
http://plain.example/stream.m3u8
#EXTINF:-1 group-title="Movies DE",Der Film (2020)
http://tv.example/movie/u/p/500.mkv
#EXTINF:-1 group-title="Series DE" tvg-logo="http://img/s.png",Die Serie S01 E01
http://tv.example/series/u/p/900.mp4
#EXTINF:-1 group-title="Series DE",Die Serie S01 E02
http://tv.example/series/u/p/901.mp4
http://bare.example/nolabel.ts
`;

describe('parseM3u', () => {
  const file = parseM3u(SAMPLE);

  it('reads header attributes', () => {
    expect(file.header).toMatchObject({ 'url-tvg': 'http://epg.example/guide.xml,http://other/epg.xml', catchup: 'default', 'catchup-days': '5' });
  });

  it('keeps commas in quoted attributes and in the title', () => {
    expect(file.entries[0]).toEqual({
      title: 'Adria 1, HD',
      url: 'http://tv.example/live/u/p/101.ts',
      attrs: { 'tvg-id': 'adria1.hr', 'tvg-chno': '3', 'tvg-logo': 'http://img/a1.png', 'group-title': 'HR | News, Info' },
      group: null,
    });
  });

  it('falls back to tvg-name, EXTGRP and bare URLs', () => {
    expect(file.entries[2]).toMatchObject({ title: 'Plain', group: 'Misc', url: 'http://plain.example/stream.m3u8' });
    expect(file.entries.at(-1)).toMatchObject({ title: 'http://bare.example/nolabel.ts', attrs: {} });
  });
});

describe('classifyEntry', () => {
  it('tells live, movies and episodes apart', () => {
    expect(classifyEntry('http://x/live/u/p/1.ts')).toBe('live');
    expect(classifyEntry('http://x/u/p/1')).toBe('live');
    expect(classifyEntry('http://x/movie/u/p/1.mp4')).toBe('movie');
    expect(classifyEntry('http://cdn/film.mkv?token=1')).toBe('movie');
    expect(classifyEntry('http://x/series/u/p/1.mkv')).toBe('series');
  });
});

describe('m3uToCatalog', () => {
  const catalog = m3uToCatalog(parseM3u(SAMPLE));

  it('builds live channels with header catch-up defaults', () => {
    expect(catalog.live).toHaveLength(4);
    expect(catalog.live[0]).toMatchObject({ name: 'Adria 1, HD', num: 3, epgId: 'adria1.hr', categoryId: 'HR | News, Info', archive: true, archiveDays: 5, catchup: { mode: 'default', source: null } });
    expect(catalog.live[1]).toMatchObject({ name: 'Alpen TV', archive: false, catchup: null });
    expect(catalog.live[2]).toMatchObject({ categoryId: 'Misc', epgId: 'Plain' });
  });

  it('groups episodes into series and keeps movies', () => {
    expect(catalog.movies).toEqual([expect.objectContaining({ name: 'Der Film (2020)', ext: 'mkv', categoryId: 'Movies DE' })]);
    expect(catalog.series).toEqual([expect.objectContaining({ name: 'Die Serie', cover: 'http://img/s.png', categoryId: 'Series DE' })]);
    const seriesId = catalog.series[0].id;
    expect(catalog.episodes).toEqual([
      expect.objectContaining({ seriesId, season: 1, number: 1, title: null, url: 'http://tv.example/series/u/p/900.mp4', image: 'http://img/s.png' }),
      expect.objectContaining({ seriesId, season: 1, number: 2, title: null, url: 'http://tv.example/series/u/p/901.mp4', image: null }),
    ]);
  });

  it('lists categories once per kind and takes the first EPG URL', () => {
    expect(catalog.categories.map((c) => `${c.kind}:${c.name}`)).toEqual(['live:HR | News, Info', 'live:AT', 'live:Misc', 'movie:Movies DE', 'series:Series DE']);
    expect(catalog.epgUrl).toBe('http://epg.example/guide.xml');
  });

  it('gives every entry a unique, stable id', () => {
    const again = m3uToCatalog(parseM3u(SAMPLE));
    expect(again.live.map((c) => c.id)).toEqual(catalog.live.map((c) => c.id));
    expect(new Set(catalog.live.map((c) => c.id)).size).toBe(catalog.live.length);
  });

  it('rejects files without entries', () => {
    expect(() => m3uToCatalog(parseM3u('#EXTM3U\n'))).toThrow(expect.objectContaining({ code: 'empty' }));
  });
});
