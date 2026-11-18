import type { XtreamLogin } from './xtream';

export type StreamFormat = 'ts' | 'm3u8';

/** Playable URL of a live channel: the M3U entry URL, or built from the Xtream login. */
export function liveStreamUrl(channel: { id: string; url: string | null }, login: XtreamLogin | null, format: StreamFormat = 'ts'): string | null {
  if (channel.url) return channel.url;
  if (!login) return null;
  const u = encodeURIComponent(login.username);
  const p = encodeURIComponent(login.password);
  return `${login.server}/live/${u}/${p}/${encodeURIComponent(channel.id)}.${format}`;
}

/** Which web player handles a URL (Android plays everything with Media3). */
export function webPlayerFor(url: string): 'mpegts' | 'hls' | 'native' {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.ts') || !/\.[a-z0-9]{2,4}$/.test(path)) return 'mpegts';
  return 'native';
}
