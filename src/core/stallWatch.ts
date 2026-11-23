/**
 * Auto buffer, during a video: when to move up one level (src/core/buffer.ts). Called on each stall
 * (playback stopped to wait for data after the picture had started).
 * - Two stalls within 5 minutes on the same level → move up. One stall is usually a hiccup.
 * - The first seconds after the picture starts don't count: right after a start, a restart (a level
 *   change) or a jump only 2.5 s are loaded, so a slow connection stalls soon whatever the level.
 */
export const STALL_WINDOW_MS = 5 * 60_000;
export const SETTLE_MS = 10_000;
export const STALLS_TO_MOVE_UP = 2;

export function createStallWatch(now: () => number = Date.now) {
  let stalls: number[] = [];
  let settledAt = Number.NEGATIVE_INFINITY;
  return {
    /** The picture (re)started: a new stream, a restart or a jump within the open one. */
    started() {
      settledAt = now() + SETTLE_MS;
    },
    /** The level went up: the new one gets a fresh start. */
    reset() {
      stalls = [];
    },
    /** A stall now; true = move up one level. */
    stall(): boolean {
      const t = now();
      if (t < settledAt) return false;
      stalls = stalls.filter((s) => t - s < STALL_WINDOW_MS);
      stalls.push(t);
      return stalls.length >= STALLS_TO_MOVE_UP;
    },
  };
}
