import { describe, expect, it } from 'vitest';
import { canReplay, canRestart, catchupUrl, channelTwinKey, replaySources, fillTemplate, m3uCatchupUrl, replayable, replayDays, xtreamCatchupUrl, zonedParts, DAY_MS, DEFAULT_ARCHIVE_DAYS } from './catchup';
import type { Programme } from './epg';

const login = { server: 'http://tv.example:8080', username: 'me', password: 'p@ss' };
// 2026-11-18 19:15 UTC = 20:15 in Paris.
const start = Date.UTC(2026, 10, 18, 19, 15);
const end = start + 45 * 60_000;
const now = Date.UTC(2026, 10, 18, 21, 0);
const prog = (s: number, e: number, archive?: boolean): Programme => ({ start: s, end: e, title: 't', description: null, ...(archive === undefined ? {} : { archive }) });
const channel = { id: '42', url: null, archive: true, archiveDays: 2, catchup: null };

describe('which programmes can be replayed', () => {
  const unflagged = { ...channel, archive: false, archiveDays: 0 };
  const plainM3u = { ...channel, url: 'http://tv.example/1.ts', archive: false, archiveDays: 0 };

  it('needs an ended programme inside the channel\'s window', () => {
    expect(canReplay(channel, prog(start, end), now)).toBe(true);
    expect(canReplay(channel, prog(now - 10, now + 10), now)).toBe(false);
    expect(canReplay(channel, prog(now - 3 * DAY_MS, now - 3 * DAY_MS + 60_000), now)).toBe(false);
  });

  it('offers every Xtream channel (7 days when the provider gives no window), and ignores per-programme flags', () => {
    expect(replayDays(unflagged)).toBe(DEFAULT_ARCHIVE_DAYS);
    expect(replayDays({ ...channel, archiveDays: 0 })).toBe(DEFAULT_ARCHIVE_DAYS);
    expect(canReplay(unflagged, prog(now - 5 * DAY_MS, now - 5 * DAY_MS + 60_000), now)).toBe(true);
    expect(canReplay(channel, prog(start, end, false), now)).toBe(true);
  });

  it('leaves out M3U channels without catch-up attributes (no way to build a link)', () => {
    expect(replayDays(plainM3u)).toBe(0);
    expect(canReplay(plainM3u, prog(start, end), now)).toBe(false);
  });

  it('restarts only what is on now', () => {
    expect(canRestart(channel, prog(now - 60_000, now + 60_000), now)).toBe(true);
    expect(canRestart(unflagged, prog(now - 60_000, now + 60_000), now)).toBe(true);
    expect(canRestart(channel, prog(start, end), now)).toBe(false);
    expect(canRestart(plainM3u, prog(now - 60_000, now + 60_000), now)).toBe(false);
  });

  it('lists replayable programmes newest first', () => {
    const list = [prog(start - 3_600_000, start), prog(start, end), prog(now - 60_000, now + 60_000)];
    expect(replayable(channel, list, now).map((p) => p.start)).toEqual([start, start - 3_600_000]);
  });
});

describe('Xtream timeshift links', () => {
  it('writes the start in the server time zone and the length in minutes', () => {
    expect(xtreamCatchupUrl(login, '42', start, end, 'Europe/Paris')).toBe('http://tv.example:8080/timeshift/me/p%40ss/45/2026-11-18:20-15/42.ts');
  });

  it('falls back to UTC without a (valid) time zone', () => {
    expect(xtreamCatchupUrl(login, '42', start, end, null)).toContain('/45/2026-11-18:19-15/42.ts');
    expect(xtreamCatchupUrl(login, '42', start, end, 'Not/AZone')).toContain('/2026-11-18:19-15/');
  });

  it('formats zoned times across midnight', () => {
    expect(zonedParts(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Berlin')).toMatchObject({ Y: '2026', m: '11', d: '19', H: '00', M: '30' });
  });

  it('is used for every Xtream channel (no own URL), flagged by the provider or not', () => {
    expect(catchupUrl(channel, login, 'Europe/Paris', start, end, now)).toContain('/timeshift/');
    expect(catchupUrl({ ...channel, archive: false, archiveDays: 0 }, login, null, start, end, now)).toContain('/timeshift/');
    expect(catchupUrl(channel, null, null, start, end, now)).toBeNull();
  });
});

describe('M3U catch-up', () => {
  const s = start / 1000;
  const m3u = (url: string, mode: string, source: string | null = null) => ({ url, catchup: { mode, source } });

  it('fills template placeholders', () => {
    expect(fillTemplate('?utc={utc}&end={utcend}&l={lutc}&d={duration}&m={duration:60}&o={offset:60}', start, end, now)).toBe(
      `?utc=${s}&end=${s + 2700}&l=${now / 1000}&d=2700&m=45&o=${(now - start) / 60_000}`,
    );
    expect(fillTemplate('/${start}-${end}/${timestamp}', start, end, now)).toBe(`/${s}-${s + 2700}/${now / 1000}`);
    expect(fillTemplate('/{Y}/{m}/{d}/{H}-{M}-{S}', start, end, now)).toBe('/2026/11/18/19-15-00');
    expect(fillTemplate('?from={utc:Y-m-d H:M:S}', start, end, now)).toBe('?from=2026-11-18 19:15:00');
    expect(fillTemplate('?keep={unknown}', start, end, now)).toBe('?keep={unknown}');
  });

  it('default: a full template, or appended when it is only a query', () => {
    expect(m3uCatchupUrl(m3u('http://a/ch.m3u8', 'default', 'http://b/arch?start={utc}'), start, end, now)).toBe(`http://b/arch?start=${s}`);
    expect(m3uCatchupUrl(m3u('http://a/ch.m3u8', 'default', '?start={utc}'), start, end, now)).toBe(`http://a/ch.m3u8?start=${s}`);
    expect(m3uCatchupUrl(m3u('http://a/ch.m3u8', 'default'), start, end, now)).toBeNull();
  });

  it('append and shift', () => {
    expect(m3uCatchupUrl(m3u('http://a/ch.m3u8?t=1', 'append', '&s={utc}'), start, end, now)).toBe(`http://a/ch.m3u8?t=1&s=${s}`);
    expect(m3uCatchupUrl(m3u('http://a/ch.m3u8', 'shift'), start, end, now)).toBe(`http://a/ch.m3u8?utc=${s}&lutc=${now / 1000}`);
    expect(m3uCatchupUrl(m3u('http://a/ch.m3u8?t=1', 'shift'), start, end, now)).toBe(`http://a/ch.m3u8?t=1&utc=${s}&lutc=${now / 1000}`);
  });

  it('flussonic HLS and MPEG-TS', () => {
    expect(m3uCatchupUrl(m3u('http://f/ch1/index.m3u8?token=x', 'flussonic'), start, end, now)).toBe(`http://f/ch1/index-${s}-2700.m3u8?token=x`);
    expect(m3uCatchupUrl(m3u('http://f/ch1/mpegts?token=x', 'fs'), start, end, now)).toBe(`http://f/ch1/timeshift_abs-${s}.ts?token=x`);
    expect(m3uCatchupUrl(m3u('http://f/ch1/index.m3u8', 'flussonic-ts'), start, end, now)).toBe(`http://f/ch1/timeshift_abs-${s}.ts`);
  });

  it('xc: Xtream links inside an M3U list', () => {
    expect(m3uCatchupUrl(m3u('http://x:80/live/u/p/77.ts', 'xc'), start, end, now)).toBe('http://x:80/timeshift/u/p/45/2026-11-18:19-15/77.ts');
    expect(m3uCatchupUrl(m3u('http://x:80/u/p/77', 'xc'), start, end, now)).toBe('http://x:80/timeshift/u/p/45/2026-11-18:19-15/77.ts');
    expect(m3uCatchupUrl(m3u('http://x/not/an/xc/link.m3u8', 'xc'), start, end, now)).toBeNull();
  });

  it('unknown modes and channels without catch-up give no link', () => {
    expect(m3uCatchupUrl(m3u('http://a/ch.m3u8', 'vod'), start, end, now)).toBeNull();
    expect(m3uCatchupUrl({ url: 'http://a/ch.m3u8', catchup: null }, start, end, now)).toBeNull();
    expect(catchupUrl({ ...channel, url: 'http://a/ch.m3u8', catchup: { mode: 'shift', source: null } }, login, null, start, end, now)).toContain('utc=');
  });
});

describe('copies of a channel', () => {
  const ch = (id: string, name: string, archive: boolean) => ({ id, name, url: null, archive, archiveDays: archive ? 7 : 0, catchup: null });

  it('ignores quality and copy marks in names', () => {
    expect(channelTwinKey('NOVA TV ᴴᴰ')).toBe('nova tv');
    expect(channelTwinKey('NOVA TV (FHD)')).toBe('nova tv');
    expect(channelTwinKey('NOVA TV ➁ (FHD)')).toBe('nova tv');
    expect(channelTwinKey('RTL 2 ᴴᴰ')).toBe('rtl 2');
    expect(channelTwinKey('HRT 2 (FHD) HEVC')).toBe('hrt 2');
    expect(channelTwinKey('HRT 3')).not.toBe(channelTwinKey('HRT 2'));
    expect(channelTwinKey('TV NOVA PULA')).not.toBe('nova tv');
  });

  it('tries the copy the provider records first, the chosen channel anyway', () => {
    const fhd = ch('80', 'NOVA TV (FHD)', false);
    const hd = ch('81', 'NOVA TV ᴴᴰ', true);
    const two = ch('296591', 'NOVA TV ➁ (FHD)', false);
    const rtl = ch('7040', 'RTL FHD', true);
    const list = [fhd, hd, two, rtl];
    expect(replaySources(fhd, list).map((c) => c.id)).toEqual(['81', '80']);
    expect(replaySources(hd, list).map((c) => c.id)).toEqual(['81']);
    expect(replaySources(rtl, list).map((c) => c.id)).toEqual(['7040']);
    expect(replaySources(fhd, list, '80').map((c) => c.id)).toEqual(['80', '81']);
  });
});
