import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import RNVideo, { type VideoRef } from 'react-native-video';
import { EMPTY_STATS, type PlaybackStats } from '../core/playbackStats';
import { usePrefs } from '../data/prefs';
import { Stats } from './Stats';
import type { VideoProps } from './types';

/** Android / Fire TV playback through Media3 (ExoPlayer): HLS, MPEG-TS, MP4, MKV. */
export function Video({ url, muted, paused, style, onPlaying, onBuffering, onError, onProgress, onEnd, startAt, seek, onDuration }: VideoProps) {
  const ref = useRef<VideoRef>(null);
  const { playbackStats } = usePrefs();
  const [stats, setStats] = useState<PlaybackStats>(EMPTY_STATS);
  const started = useRef(false);
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
        source={{ uri: url, startPosition: startAt && startAt > 0 ? Math.round(startAt * 1000) : undefined }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        muted={muted}
        paused={paused}
        progressUpdateInterval={500}
        reportBandwidth={playbackStats}
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
        onBandwidthUpdate={playbackStats ? (e) => note({ networkBps: e.bitrate }) : undefined}
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
      {playbackStats ? <Stats stats={stats} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000' },
});
