/**
 * How far movies, episodes and replays load ahead (Settings → Playback → Movie buffer). Each level is a tuned
 * set: the most loaded ahead, and how much must be loaded again after a stall before playback goes on.
 * The start and a jump always wait for 2.5 s only. Live streams don't use this (they follow the live edge).
 */
export const BUFFER_LEVELS = ['small', 'medium', 'large', 'max'] as const;
export type BufferLevel = (typeof BUFFER_LEVELS)[number];

/** Small = Media3's defaults (what Plumcast did before the setting existed). */
export const DEFAULT_BUFFER_LEVEL: BufferLevel = 'small';

export interface FileBuffer {
  /** Load ahead up to this much (ms); the memory guard may stop earlier. */
  aheadMs: number;
  /** Before playback starts or after a jump (ms). */
  startMs: number;
  /** After a stall, wait until this much is loaded again (ms). */
  afterStallMs: number;
}

const LEVELS: Record<BufferLevel, FileBuffer> = {
  small: { aheadMs: 50_000, startMs: 2_500, afterStallMs: 5_000 },
  medium: { aheadMs: 120_000, startMs: 2_500, afterStallMs: 15_000 },
  large: { aheadMs: 240_000, startMs: 2_500, afterStallMs: 30_000 },
  max: { aheadMs: 480_000, startMs: 2_500, afterStallMs: 60_000 },
};

export function fileBuffer(level: BufferLevel): FileBuffer {
  return LEVELS[level] ?? LEVELS[DEFAULT_BUFFER_LEVEL];
}

export function isBufferLevel(value: unknown): value is BufferLevel {
  return typeof value === 'string' && (BUFFER_LEVELS as readonly string[]).includes(value);
}
