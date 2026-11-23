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
  /** Seconds downloaded ahead of the playback position. */
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
export function statsLines(s: PlaybackStats): string[] {
  const picture = [s.width && s.height ? `${s.width}×${s.height}` : '', codecName(s.codec)].filter(Boolean).join(' · ');
  return [
    picture || '–',
    `Net ${mbps(s.networkBps)} · Stream ${mbps(s.streamBps)}`,
    `Buffer ${Math.max(0, s.bufferedS).toFixed(1)} s · Stalls ${s.stalls}`,
  ];
}
