import { describe, expect, it } from 'vitest';
import { foldSearch, likeContains } from './search';
import { liveStreamUrl, webPlayerFor } from './streams';

describe('liveStreamUrl', () => {
  const login = { server: 'http://tv.example.com:8080', username: 'anna', password: 'p/w' };
  it('builds Xtream live URLs in the chosen format', () => {
    expect(liveStreamUrl({ id: '42', url: null }, login)).toBe('http://tv.example.com:8080/live/anna/p%2Fw/42.ts');
    expect(liveStreamUrl({ id: '42', url: null }, login, 'm3u8')).toBe('http://tv.example.com:8080/live/anna/p%2Fw/42.m3u8');
  });
  it('uses the M3U URL as is', () => {
    expect(liveStreamUrl({ id: 'x', url: 'http://a/b.m3u8' }, null)).toBe('http://a/b.m3u8');
    expect(liveStreamUrl({ id: 'x', url: null }, null)).toBeNull();
  });
});

describe('webPlayerFor', () => {
  it('picks the browser player by extension', () => {
    expect(webPlayerFor('http://a/live/u/p/1.ts')).toBe('mpegts');
    expect(webPlayerFor('http://a/x/index.m3u8?token=1')).toBe('hls');
    expect(webPlayerFor('http://a/movie/u/p/1.mp4')).toBe('native');
    expect(webPlayerFor('http://a/u/p/12345')).toBe('mpegts');
  });
});

describe('search', () => {
  it('folds case and accents', () => {
    expect(foldSearch('  ČESKÁ   Televize ')).toBe('ceska televize');
    expect(foldSearch('Große Hörspiele')).toBe('grosse horspiele');
    expect(foldSearch('Đurđevac')).toBe('durdevac');
  });
  it('escapes LIKE wildcards', () => {
    expect(likeContains('100%_a')).toBe('%100\\%\\_a%');
  });
});
