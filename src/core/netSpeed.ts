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

/**
 * A video's average bitrate from its file size and length, for videos the provider lists without one
 * (Auto buffer's fallback). Null when either is missing or the result is nonsense.
 */
export function averageBitrate(sizeBytes: number | null, durationMs: number | null): number | null {
  if (!sizeBytes || !durationMs || sizeBytes <= 0 || durationMs < 60_000) return null;
  const bps = (sizeBytes * 8) / (durationMs / 1000);
  return bps >= 100_000 && bps <= 200_000_000 ? Math.round(bps) : null;
}

/**
 * The whole file's size from the answer to a request for its first byte: "bytes 0-0/7680000000" (206),
 * or Content-Length when the server ignores the range (200). Null otherwise.
 */
export function sizeFromHeaders(status: number, contentRange: string | null, contentLength: string | null): number | null {
  if (status === 206) {
    const total = Number(/\/\s*(\d+)\s*$/.exec(contentRange ?? '')?.[1]);
    return Number.isFinite(total) && total > 0 ? total : null;
  }
  if (status === 200) {
    const length = Number(contentLength);
    return Number.isFinite(length) && length > 1 ? length : null;
  }
  return null;
}
