/**
 * When the TV guide may update by itself: only while the app is idle, so a download never competes
 * with a video for the connection (many providers allow one, at little more than one stream's speed).
 */

/** Idle starts this long after the last video closed (zapping doesn't count as idle). */
export const IDLE_AFTER_VIDEO_MS = 30_000;
/** While the app is open and idle, look again this often. */
export const AUTO_CHECK_EVERY_MS = 5 * 60_000;

export interface AutoUpdateInput {
  now: number;
  /** Settings → TV guide → Update automatically. */
  enabled: boolean;
  /** The app is in the foreground. */
  appActive: boolean;
  /** Videos on screen right now (full player or the Live TV preview). */
  videosOnScreen: number;
  /** When the last video closed (null = none closed since the app started). */
  lastVideoEndedAt: number | null;
  /** A guide download or a playlist update is already running. */
  busy: boolean;
  /** When the stored guide was downloaded (null = no guide stored). */
  fetchedAt: number | null;
  /** When the last download failed (null = it didn't). */
  lastFailureAt: number | null;
  /** A guide younger than this is fresh. */
  freshMs: number;
  /** After a failure, wait this long before trying again. */
  retryFailedMs: number;
}

export function shouldAutoUpdate(i: AutoUpdateInput): boolean {
  if (!i.enabled || !i.appActive || i.busy || i.videosOnScreen > 0) return false;
  if (i.lastVideoEndedAt !== null && i.now - i.lastVideoEndedAt < IDLE_AFTER_VIDEO_MS) return false;
  if (i.lastFailureAt !== null && i.now - i.lastFailureAt < i.retryFailedMs) return false;
  return i.fetchedAt === null || i.now - i.fetchedAt >= i.freshMs;
}

/** How long until idle starts after a video closed (0 = it already has). */
export function idleIn(now: number, lastVideoEndedAt: number | null): number {
  return lastVideoEndedAt === null ? 0 : Math.max(0, lastVideoEndedAt + IDLE_AFTER_VIDEO_MS - now);
}
