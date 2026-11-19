import type { Programme } from './epg';
import type { M3uCatchup } from './models';
import type { XtreamLogin } from './xtream';

/** Catch-up (replays of past programmes): which programmes can be replayed and their stream URLs. */

export const DAY_MS = 24 * 60 * 60_000;

export interface ArchiveChannel {
  id: string;
  url: string | null;
  archive: boolean;
  archiveDays: number;
  catchup: M3uCatchup | null;
}

/**
 * Replay window when the provider doesn't say: its "has archive" flag per channel is often
 * missing on channels that do have recordings, so every channel is offered.
 */
export const DEFAULT_ARCHIVE_DAYS = 7;

type ReplayChannel = Pick<ArchiveChannel, 'archive' | 'archiveDays' | 'url' | 'catchup'>;

/**
 * Days a channel's replays reach back. Every Xtream channel can be asked (the provider decides);
 * an M3U channel only with `catchup` attributes, since its replay link is built from them.
 */
export function replayDays(channel: ReplayChannel): number {
  if (channel.archive && channel.archiveDays > 0) return channel.archiveDays;
  if (channel.url && !channel.catchup) return 0;
  return DEFAULT_ARCHIVE_DAYS;
}

/** Oldest moment the channel's archive still reaches. */
export function archiveStart(channel: ReplayChannel, now: number): number {
  return now - replayDays(channel) * DAY_MS;
}

/** Ended and inside the replay window. Whether the recording exists is left to the provider. */
export function canReplay(channel: ReplayChannel, programme: Programme, now: number): boolean {
  return replayDays(channel) > 0 && programme.end <= now && programme.start >= archiveStart(channel, now);
}

/** On now, on a channel that can replay: can be watched from its start. */
export function canRestart(channel: ReplayChannel, programme: Programme, now: number): boolean {
  return replayDays(channel) > 0 && programme.start <= now && now < programme.end;
}

/** Replayable programmes, newest first. */
export function replayable(channel: ReplayChannel, programmes: readonly Programme[], now: number): Programme[] {
  return programmes.filter((p) => canReplay(channel, p, now)).sort((a, b) => b.start - a.start);
}

// ---------------------------------------------------------------- time formatting

interface Parts {
  Y: string;
  m: string;
  d: string;
  H: string;
  M: string;
  S: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function utcParts(ms: number): Parts {
  const d = new Date(ms);
  return {
    Y: String(d.getUTCFullYear()),
    m: pad(d.getUTCMonth() + 1),
    d: pad(d.getUTCDate()),
    H: pad(d.getUTCHours()),
    M: pad(d.getUTCMinutes()),
    S: pad(d.getUTCSeconds()),
  };
}

/** Date and time parts in a time zone ("Europe/Paris"); UTC when the zone is missing or unknown. */
export function zonedParts(ms: number, timeZone: string | null): Parts {
  if (!timeZone) return utcParts(ms);
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(ms);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const out = { Y: get('year'), m: get('month'), d: get('day'), H: get('hour'), M: get('minute'), S: get('second') };
    return Object.values(out).every((v) => /^\d+$/.test(v)) ? out : utcParts(ms);
  } catch {
    return utcParts(ms);
  }
}

/** "2026-11-18:20-15", the start format of Xtream timeshift links. */
const xcTime = (p: Parts) => `${p.Y}-${p.m}-${p.d}:${p.H}-${p.M}`;
const minutesOf = (start: number, end: number) => Math.max(1, Math.ceil((end - start) / 60_000));

// ---------------------------------------------------------------- Xtream

/**
 * `/timeshift/USER/PASS/MINUTES/YYYY-MM-DD:HH-MM/ID.ts`. Xtream panels read the start in the
 * server's own time zone (`server_info.timezone`), so it is written in that zone.
 */
export function xtreamCatchupUrl(login: XtreamLogin, streamId: string, start: number, end: number, timeZone: string | null): string {
  const u = encodeURIComponent(login.username);
  const p = encodeURIComponent(login.password);
  return `${login.server}/timeshift/${u}/${p}/${minutesOf(start, end)}/${xcTime(zonedParts(start, timeZone))}/${encodeURIComponent(streamId)}.ts`;
}

// ---------------------------------------------------------------- M3U

const LETTERS = /[YmdHMS]/g;

/**
 * Fills a `catchup-source` template. Supports the common placeholders: {utc}/${start},
 * {utcend}/${end}, {lutc}/${now}/${timestamp}, {duration}, {duration:60}, {offset}, {offset:60},
 * {Y}{m}{d}{H}{M}{S} (start, UTC) and formatted times like {utc:Y-m-d H:M:S}.
 */
export function fillTemplate(template: string, start: number, end: number, now: number): string {
  const s = Math.floor(start / 1000);
  const e = Math.floor(end / 1000);
  const n = Math.floor(now / 1000);
  const timeOf = (name: string): number | null => {
    if (name === 'utc' || name === 'start') return s;
    if (name === 'utcend' || name === 'end') return e;
    if (name === 'lutc' || name === 'now' || name === 'timestamp') return n;
    return null;
  };
  return template.replace(/\$?\{([a-z]+|[YmdHMS])(?::([^}]*))?\}/g, (whole, name: string, arg: string | undefined) => {
    const t = timeOf(name);
    if (t !== null) {
      if (!arg) return String(t);
      const parts = utcParts(t * 1000);
      return arg.replace(LETTERS, (k) => parts[k as keyof Parts]);
    }
    if (name === 'duration' || name === 'offset') {
      const value = name === 'duration' ? e - s : n - s;
      const divisor = Number(arg);
      return String(arg && divisor > 0 ? Math.floor(value / divisor) : value);
    }
    if (/^[YmdHMS]$/.test(name)) return utcParts(start)[name as keyof Parts];
    return whole;
  });
}

const join = (url: string, query: string) => url + (url.includes('?') ? '&' : '?') + query;

/** Flussonic: `.../index.m3u8` → `.../index-START-DURATION.m3u8`, `.../mpegts` → `.../timeshift_abs-START.ts`. */
function flussonicUrl(url: string, mode: string, start: number, end: number): string | null {
  const m = /^(.*\/)([^/?#]*)([?#].*)?$/.exec(url);
  if (!m) return null;
  const [, dir, file, rest = ''] = m;
  const s = Math.floor(start / 1000);
  const duration = Math.floor((end - start) / 1000);
  const hls = /\.m3u8$/i.test(file);
  if (hls && mode !== 'flussonic-ts') return `${dir}${file.replace(/\.m3u8$/i, '')}-${s}-${duration}.m3u8${rest}`;
  return `${dir}timeshift_abs-${s}.ts${rest}`;
}

/** An Xtream live link inside an M3U list: `http://host/[live/]USER/PASS/ID[.ext]`. */
function xcFromM3u(url: string, start: number, end: number): string | null {
  const m = /^(https?:\/\/[^/]+)\/(?:live\/)?([^/]+)\/([^/]+)\/(\d+)(?:\.\w+)?(?:[?#].*)?$/i.exec(url);
  if (!m) return null;
  const [, host, user, pass, id] = m;
  return `${host}/timeshift/${user}/${pass}/${minutesOf(start, end)}/${xcTime(utcParts(start))}/${id}.ts`;
}

/** Catch-up link of an M3U channel from its `catchup` attributes, or null when it has none / an unknown mode. */
export function m3uCatchupUrl(channel: Pick<ArchiveChannel, 'url' | 'catchup'>, start: number, end: number, now: number): string | null {
  const { url, catchup } = channel;
  if (!url || !catchup) return null;
  const mode = catchup.mode.toLowerCase();
  const source = catchup.source?.trim() || null;
  switch (mode) {
    case 'default':
      if (!source) return null;
      return /^[a-z]+:\/\//i.test(source) ? fillTemplate(source, start, end, now) : url + fillTemplate(source, start, end, now);
    case 'append':
      return source ? url + fillTemplate(source, start, end, now) : null;
    case 'shift':
    case 'timeshift':
      return join(url, `utc=${Math.floor(start / 1000)}&lutc=${Math.floor(now / 1000)}`);
    case 'flussonic':
    case 'flussonic-hls':
    case 'flussonic-ts':
    case 'fs':
      return flussonicUrl(url, mode, start, end);
    case 'xc':
      return xcFromM3u(url, start, end);
    default:
      return null;
  }
}

/** Replay link for `start..end`: M3U channels use their attributes, Xtream channels the timeshift API. */
export function catchupUrl(
  channel: ArchiveChannel,
  login: XtreamLogin | null,
  timeZone: string | null,
  start: number,
  end: number,
  now: number,
): string | null {
  if (replayDays(channel) === 0) return null;
  if (channel.url) return m3uCatchupUrl(channel, start, end, now);
  return login ? xtreamCatchupUrl(login, channel.id, start, end, timeZone) : null;
}

// ---------------------------------------------------------------- copies of a channel

/** Quality and copy marks providers add to channel names. */
const NAME_NOISE = new Set(['hd', 'fhd', 'uhd', 'sd', 'hq', '4k', '8k', 'hevc', 'h265', 'h264', 'hdr', 'dvb', 'raw', 'backup', '720p', '1080p', '2160p', '50fps', '60fps']);

/**
 * A channel's name without quality and copy marks, to find the same channel listed several
 * times: "NOVA TV ᴴᴰ", "NOVA TV (FHD)" and "NOVA TV ➁ (FHD)" all give "nova tv".
 */
export function channelTwinKey(name: string): string {
  return name
    .replace(/[①-⓿❶-➓]/g, ' ') // ①, ➁ … copy marks (before NFKC turns them into digits)
    .normalize('NFKC') // ᴴᴰ → HD
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !NAME_NOISE.has(w))
    .join(' ');
}

type SourceChannel = ReplayChannel & { id: string; name: string };

/**
 * Where to look for a channel's recordings, best first. Providers often record only one copy of
 * a channel (the one they flag); the others answer with a filler clip. So: the channel itself
 * when it's flagged, then its flagged copies, then the channel itself anyway. A `preferred`
 * source (the one that worked last) goes first.
 */
export function replaySources<T extends SourceChannel>(channel: T, others: readonly T[], preferred: string | null = null): T[] {
  const key = channelTwinKey(channel.name);
  const twins = key ? others.filter((c) => c.id !== channel.id && c.archive && replayDays(c) > 0 && channelTwinKey(c.name) === key) : [];
  const list = channel.archive ? [channel, ...twins] : [...twins, channel];
  const best = list.findIndex((c) => c.id === preferred);
  return best > 0 ? [list[best], ...list.slice(0, best), ...list.slice(best + 1)] : list;
}
