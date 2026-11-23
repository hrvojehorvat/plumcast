/**
 * How far movies, episodes and replays load ahead (Settings → Playback → Movie buffer). Each level is a tuned
 * set: the most loaded ahead, and how much must be loaded again after a stall before playback goes on.
 * The start and a jump always wait for 2.5 s only. Live streams don't use this (they follow the live edge).
 */
export const BUFFER_LEVELS = ['small', 'medium', 'large', 'max'] as const;
export type BufferLevel = (typeof BUFFER_LEVELS)[number];

/** Settings → Playback → Movie buffer: Auto (chosen for each video) or one fixed level. */
export const BUFFER_CHOICES = ['auto', ...BUFFER_LEVELS] as const;
export type BufferChoice = (typeof BUFFER_CHOICES)[number];
export const DEFAULT_BUFFER_CHOICE: BufferChoice = 'auto';

export interface FileBuffer {
  /** Load ahead up to this much (ms); the memory guard may stop earlier. */
  aheadMs: number;
  /** Before playback starts or after a jump (ms). */
  startMs: number;
  /** After a stall, wait until this much is loaded again (ms). */
  afterStallMs: number;
}

const LEVELS: Record<BufferLevel, FileBuffer> = {
  // Media3's defaults (what Plumcast did before the setting existed).
  small: { aheadMs: 50_000, startMs: 2_500, afterStallMs: 5_000 },
  medium: { aheadMs: 120_000, startMs: 2_500, afterStallMs: 15_000 },
  large: { aheadMs: 240_000, startMs: 2_500, afterStallMs: 30_000 },
  max: { aheadMs: 480_000, startMs: 2_500, afterStallMs: 60_000 },
};

export function fileBuffer(level: BufferLevel): FileBuffer {
  return LEVELS[level] ?? LEVELS.small;
}

export function isBufferChoice(value: unknown): value is BufferChoice {
  return typeof value === 'string' && (BUFFER_CHOICES as readonly string[]).includes(value);
}

const GB = 1024 ** 3;

/**
 * The highest level a TV with this much RAM gets from Auto. The memory guard protects every level anyway;
 * this keeps a weak TV from holding most of its memory for one video. Unknown RAM: up to Large.
 */
export function maxLevelForRam(totalBytes: number | null): BufferLevel {
  if (totalBytes === null || !Number.isFinite(totalBytes) || totalBytes <= 0) return 'large';
  if (totalBytes <= 1.5 * GB) return 'medium';
  if (totalBytes <= 3 * GB) return 'large';
  return 'max';
}

/**
 * Auto's level for a video, before it starts: the lowest one that is probably enough. It compares the
 * playlist's remembered download speed with the video's average bitrate. Clearly faster → Small (stalls
 * are rare, and one is over in 5 s); about as fast or slower → more buffer. Unknown speed or bitrate →
 * Small (start low; a stall moves it up). Never above what the TV's RAM allows.
 */
export function autoLevel(speedBps: number | null, bitrateBps: number | null, ramBytes: number | null): BufferLevel {
  const ceiling = maxLevelForRam(ramBytes);
  let level: BufferLevel = 'small';
  if (speedBps && bitrateBps && speedBps > 0 && bitrateBps > 0) {
    const ratio = speedBps / bitrateBps;
    level = ratio >= 1.5 ? 'small' : ratio >= 1.1 ? 'medium' : ratio >= 0.8 ? 'large' : 'max';
  }
  return BUFFER_LEVELS.indexOf(level) > BUFFER_LEVELS.indexOf(ceiling) ? ceiling : level;
}

/** The level a video plays with: the fixed one from Settings, or Auto's choice. */
export function resolveLevel(choice: BufferChoice, speedBps: number | null, bitrateBps: number | null, ramBytes: number | null): BufferLevel {
  return choice === 'auto' ? autoLevel(speedBps, bitrateBps, ramBytes) : choice;
}

/**
 * Continuing a video in the middle: there is no reserve from its (often light) opening minutes, so on a
 * connection that is tight or too slow for it (< 1.1×), the first busy scene would stall right away. Then
 * the stream waits for this much video before playing, once at the start (and after a jump within it).
 */
export const HEAD_START_MS = 20_000;

export function needsHeadStart(continuing: boolean, speedBps: number | null, bitrateBps: number | null): boolean {
  if (!continuing || !speedBps || !bitrateBps || speedBps <= 0 || bitrateBps <= 0) return false;
  return speedBps / bitrateBps < 1.1;
}
