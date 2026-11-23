/**
 * The download speed a playlist's server gives, remembered between videos so Auto buffer can choose a
 * level before the next one starts (src/core/buffer.ts). Media3 reports an estimate while it loads; each
 * report moves the remembered value part of the way, so one slow or fast moment doesn't decide alone.
 */
const WEIGHT = 0.3;
/** Reports outside this range are glitches (or Media3's built-in guess), not measurements. */
const MIN_BPS = 50_000;
const MAX_BPS = 2_000_000_000;

export function nextSpeed(previous: number | null, sampleBps: number): number | null {
  if (!Number.isFinite(sampleBps) || sampleBps < MIN_BPS || sampleBps > MAX_BPS) return previous;
  if (previous === null) return Math.round(sampleBps);
  return Math.round(previous + (sampleBps - previous) * WEIGHT);
}

/** Xtream `info.bitrate` is the file's average in kbit/s ("12241"); null when missing or nonsense. */
export function bitrateFromInfo(kbps: number | null): number | null {
  if (kbps === null || !Number.isFinite(kbps) || kbps < 100 || kbps > 200_000) return null;
  return Math.round(kbps * 1000);
}
