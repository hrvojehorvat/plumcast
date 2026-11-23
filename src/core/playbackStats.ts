/** What the player measures while a stream plays (Android only), for the small stats corner. */
export interface PlaybackStats {
  width: number;
  height: number;
  /** Video codec as the stream declares it (e.g. "hvc1.2.4.L153"); empty when unknown. */
  codec: string;
  /** The stream's own video bitrate in bit/s; 0 when the stream doesn't say (common for TS and MKV). */
  streamBps: number;
  /** Measured download speed in bit/s (Media3's estimate); 0 until the first sample. */
  networkBps: number;
  /**
   * Seconds downloaded ahead of the playback position. Rough: react-native-video derives it from the
   * buffered percentage (1 % steps), and for live streams (no length) it is meaningless.
   */
  bufferedS: number;
  /** Times playback stopped to wait for data since the first frame. */
  stalls: number;
}

export const EMPTY_STATS: PlaybackStats = { width: 0, height: 0, codec: '', streamBps: 0, networkBps: 0, bufferedS: 0, stalls: 0 };

/** "hvc1.2.4.L153" → "HEVC"; unknown codecs show their first part. */
export function codecName(codecs: string): string {
  const id = codecs.split('.')[0]?.toLowerCase() ?? '';
  if (!id) return '';
  if (id === 'hvc1' || id === 'hev1') return 'HEVC';
  if (id === 'avc1' || id === 'avc3') return 'H.264';
  if (id === 'av01') return 'AV1';
  if (id === 'vp09') return 'VP9';
  return id;
}

export function mbps(bps: number): string {
  return bps > 0 ? `${(bps / 1_000_000).toFixed(1)} Mb/s` : '–';
}

/** The stats corner's lines: picture, download vs stream, buffer and stalls. */
export function statsLines(s: PlaybackStats, level: string | null = null): string[] {
  const picture = [s.width && s.height ? `${s.width}×${s.height}` : '', codecName(s.codec)].filter(Boolean).join(' · ');
  return [
    picture || '–',
    `Net ${mbps(s.networkBps)} · Stream ${mbps(s.streamBps)}`,
    `Buffer ${bufferText(s.bufferedS)}${level ? ` (${level})` : ''} · Stalls ${s.stalls}`,
  ];
}

/** Live streams report nonsense (no length to take a percentage of): anything outside 0 s – 1 day is "–". */
function bufferText(seconds: number): string {
  return Number.isFinite(seconds) && seconds >= 0 && seconds < 86_400 ? `${seconds.toFixed(1)} s` : '–';
}
