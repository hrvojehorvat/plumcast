/**
 * Auto buffer, during a video: when to move up one level (src/core/buffer.ts). Called on each stall
 * (playback stopped to wait for data after it had started).
 * - The connection measurably slower than the video needs → at the first stall: more are certain.
 * - Otherwise (or bitrate unknown) → at the second stall within 5 minutes: one stall is usually a hiccup.
 * - Loading right after a jump within the video isn't a stall.
 */
export const STALL_WINDOW_MS = 5 * 60_000;
export const AFTER_JUMP_MS = 3_000;

export function createStallWatch(now: () => number = Date.now) {
  let stalls: number[] = [];
  let jumpedAt = Number.NEGATIVE_INFINITY;
  let speedBps: number | null = null;
  return {
    /** A jump within the open stream (its loading isn't a stall). */
    jumped() {
      jumpedAt = now();
    },
    /** The latest measured download speed during this video. */
    speed(bps: number) {
      if (Number.isFinite(bps) && bps > 0) speedBps = bps;
    },
    /** The level went up: the new one gets a fresh start. */
    reset() {
      stalls = [];
    },
    /** A stall now; true = move up one level. */
    stall(bitrateBps: number | null): boolean {
      const t = now();
      if (t - jumpedAt < AFTER_JUMP_MS) return false;
      stalls = stalls.filter((s) => t - s < STALL_WINDOW_MS);
      stalls.push(t);
      if (bitrateBps && speedBps !== null && speedBps < bitrateBps) return true;
      return stalls.length >= 2;
    },
  };
}
