import { list, num, obj, str } from './coerce';
import type { XtreamLogin } from './xtream';

/** What `get_vod_info` adds to a movie from the list. Every field is optional on real servers. */
export interface MovieInfo {
  plot: string | null;
  cast: string | null;
  director: string | null;
  genre: string | null;
  country: string | null;
  year: number | null;
  /** 0–10. */
  rating: number | null;
  durationMs: number | null;
  poster: string | null;
  backdrop: string | null;
  /** YouTube video id. */
  trailer: string | null;
  ext: string | null;
}

const text = (v: unknown): string | null => {
  const s = str(v)?.trim();
  return s ? s : null;
};

/** "A, B, A, A" → "A, B" (some servers repeat names). */
function names(v: unknown): string | null {
  const raw = text(v);
  if (!raw) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out.join(', ') || null;
}

/** "01:26:11" or "86" (minutes) → ms. */
function parseDuration(info: Record<string, unknown>): number | null {
  const secs = num(info.duration_secs);
  if (secs && secs > 0) return secs * 1000;
  const clock = str(info.duration);
  const m = clock ? /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(clock.trim()) : null;
  if (m) {
    const [h, min, s] = m[3] === undefined ? [0, Number(m[1]), Number(m[2])] : [Number(m[1]), Number(m[2]), Number(m[3])];
    const ms = ((h * 60 + min) * 60 + s) * 1000;
    if (ms > 0) return ms;
  }
  const minutes = num(info.episode_run_time);
  return minutes && minutes > 0 ? minutes * 60_000 : null;
}

function parseYear(...values: unknown[]): number | null {
  for (const v of values) {
    const m = /\b(19\d{2}|20\d{2})\b/.exec(String(v ?? ''));
    if (m) return Number(m[1]);
  }
  return null;
}

/** A YouTube id from an id or any youtube.com / youtu.be link; null for anything else. */
export function youtubeId(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^[\w-]{11}$/.test(value)) return value;
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i.exec(value);
  return m ? m[1] : null;
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function parseVodInfo(json: unknown): MovieInfo {
  const root = obj(json);
  const info = obj(root.info);
  const data = obj(root.movie_data);
  const backdrops = list(info.backdrop_path).map(text).filter((s): s is string => s !== null);
  const rating = num(info.rating);
  return {
    plot: text(info.plot) ?? text(info.description),
    cast: names(info.cast) ?? names(info.actors),
    director: names(info.director),
    genre: text(info.genre),
    country: text(info.country),
    year: parseYear(info.releasedate, info.release_date, info.year, data.year),
    rating: rating !== null && rating > 0 ? Math.min(10, rating) : null,
    durationMs: parseDuration(info),
    poster: text(info.movie_image) ?? text(info.cover_big),
    backdrop: backdrops[0] ?? text(info.backdrop_path),
    trailer: youtubeId(str(info.youtube_trailer) ?? str(info.trailer)),
    ext: text(data.container_extension),
  };
}

/** Playable URL of a movie: the M3U entry URL, or built from the Xtream login. */
export function movieStreamUrl(movie: { id: string; url: string | null; ext: string | null }, login: XtreamLogin | null): string | null {
  if (movie.url) return movie.url;
  if (!login) return null;
  const ext = (movie.ext ?? 'mp4').toLowerCase().replace(/^\./, '') || 'mp4';
  return `${login.server}/movie/${encodeURIComponent(login.username)}/${encodeURIComponent(login.password)}/${encodeURIComponent(movie.id)}.${ext}`;
}

const YEAR_SUFFIX = [/^(.*\S)\s*[([]\s*((?:19|20)\d{2})\s*[)\]]\s*$/, /^(.*\S)\s+-\s+((?:19|20)\d{2})$/];

/**
 * "An Honest Life (2025)" → title "An Honest Life", year 2025. Names without a year stay as they
 * are. Some lists repeat it ("Heartland (2026) (2026)"), so every trailing year goes.
 */
export function splitTitle(name: string): { title: string; year: number | null } {
  let title = name.trim();
  let year: number | null = null;
  for (;;) {
    const m = YEAR_SUFFIX.map((re) => re.exec(title)).find(Boolean);
    if (!m) return { title, year };
    title = m[1];
    year ??= Number(m[2]);
  }
}

// ---- resume ----

const MIN_RESUME_MS = 60_000;
const END_CREDITS_MS = 4 * 60_000;

/** Counts as watched near the end (the last 4 minutes are usually credits), or at 95 %. */
export function isFinished(positionMs: number, durationMs: number | null): boolean {
  if (!durationMs || durationMs <= 0) return false;
  return positionMs >= durationMs * 0.95 || (durationMs - positionMs <= END_CREDITS_MS && positionMs >= durationMs * 0.7);
}

/** Where "Resume" starts: null when there is nothing worth resuming (barely started or finished). */
export function resumeAt(progress: { positionMs: number; durationMs: number | null; watched: boolean } | null): number | null {
  if (!progress || progress.watched) return null;
  if (progress.positionMs < MIN_RESUME_MS || isFinished(progress.positionMs, progress.durationMs)) return null;
  return progress.positionMs;
}

/** Seek step for repeated ◀/▶ presses in a movie: 10 s, then 30 s, then 1 min, then 5 min. */
export function movieSeekStep(presses: number): number {
  if (presses < 3) return 10_000;
  if (presses < 6) return 30_000;
  if (presses < 10) return 60_000;
  return 5 * 60_000;
}

/** "1:02:13" / "42:05". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "2 h 06 min" style length as hours + minutes. */
export function lengthParts(ms: number): { h: number; m: number } {
  const minutes = Math.round(ms / 60_000);
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}
