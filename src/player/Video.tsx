import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import RNVideo, { BufferingStrategyType, type BufferConfig, type VideoRef } from 'react-native-video';
import { fileBuffer, type BufferLevel } from '../core/buffer';
import { EMPTY_STATS, type PlaybackStats } from '../core/playbackStats';
import { usePrefs } from '../data/prefs';
import { Stats } from './Stats';
import type { VideoProps } from './types';

/**
 * Files (movies, episodes, replays) load ahead as far as their buffer level says (src/core/buffer.ts; the
 * player decides it, src/player/useBufferLevel.ts), and only as far as memory allows: the DependingOnMemory
 * strategy stops early when the heap gets low (20 % kept free); plugins/withLargeHeap.js asks for a bigger
 * one. min = max, so the time decides, not Media3's byte target. Live streams keep react-native-video's
 * defaults (live edge).
 */
function fileBufferConfig(level: BufferLevel): BufferConfig {
  const b = fileBuffer(level);
  return {
    minBufferMs: b.aheadMs,
    maxBufferMs: b.aheadMs,
    bufferForPlaybackMs: b.startMs,
    bufferForPlaybackAfterRebufferMs: b.afterStallMs,
    minBufferMemoryReservePercent: 0.2,
  };
}

/** Media3's first speed reports are its built-in guess, not a measurement: ignored for this long. */
const BANDWIDTH_SETTLE_MS = 5_000;

/** Android / Fire TV playback through Media3 (ExoPlayer): HLS, MPEG-TS, MP4, MKV. */
export function Video({ url, live = true, muted, paused, style, onPlaying, onBuffering, onError, onProgress, onEnd, startAt, seek, onDuration, onBandwidth, buffer, averageBps }: VideoProps) {
  const ref = useRef<VideoRef>(null);
  const { playbackStats } = usePrefs();
  // Read once per stream: a new buffer would restart the player mid-video.
  const [bufferConfig] = useState(() => (live ? undefined : fileBufferConfig(buffer ?? 'small')));
  const [stats, setStats] = useState<PlaybackStats>(EMPTY_STATS);
  const started = useRef(false);
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (seek && Number.isFinite(seek.seconds)) ref.current?.seek(Math.max(0, seek.seconds));
  }, [seek]);
  // A new stream starts with fresh stats: the players key <Video> by its URL, so it mounts anew.
  const note = (patch: Partial<PlaybackStats>) => {
    if (playbackStats) setStats((s) => ({ ...s, ...patch }));
  };
  return (
    <View style={[styles.root, style]}>
      <RNVideo
        ref={ref}
        key={url}
        source={{
          uri: url,
          startPosition: startAt && startAt > 0 ? Math.round(startAt * 1000) : undefined,
          bufferConfig,
        }}
        bufferingStrategy={live ? undefined : BufferingStrategyType.DEPENDING_ON_MEMORY}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        muted={muted}
        paused={paused}
        progressUpdateInterval={500}
        reportBandwidth
        onLoad={(e) => {
          if (playbackStats) {
            const track = e.videoTracks.find((v) => v.selected) ?? e.videoTracks[0];
            note({
              width: e.naturalSize.width || track?.width || 0,
              height: e.naturalSize.height || track?.height || 0,
              codec: track?.codecs ?? '',
              streamBps: track?.bitrate ?? 0,
            });
          }
          if (e.duration > 0) onDuration?.(e.duration);
        }}
        onBandwidthUpdate={(e) => {
          note({ networkBps: e.bitrate });
          if (Date.now() - mountedAt >= BANDWIDTH_SETTLE_MS) onBandwidth?.(e.bitrate);
        }}
        onProgress={
          onProgress || playbackStats
            ? (e) => {
                note({ bufferedS: e.playableDuration - e.currentTime });
                onProgress?.(e.currentTime);
              }
            : undefined
        }
        onEnd={onEnd}
        focusable={false}
        disableFocus
        onReadyForDisplay={() => {
          started.current = true;
          onPlaying?.();
        }}
        onBuffer={(e) => {
          if (e.isBuffering && started.current) setStats((s) => (playbackStats ? { ...s, stalls: s.stalls + 1 } : s));
          onBuffering?.(e.isBuffering);
        }}
        onError={(e) => onError?.(e.error.errorString ?? e.error.localizedDescription ?? 'Playback error')}
      />
      {playbackStats ? <Stats stats={stats} level={live ? null : (buffer ?? 'small')} averageBps={live ? null : (averageBps ?? null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000' },
});
