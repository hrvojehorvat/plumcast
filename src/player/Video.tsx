import { useEffect, useRef } from 'react';
import RNVideo, { type VideoRef } from 'react-native-video';
import type { VideoProps } from './types';

/** Android / Fire TV playback through Media3 (ExoPlayer): HLS, MPEG-TS, MP4, MKV. */
export function Video({ url, muted, paused, style, onPlaying, onBuffering, onError, onProgress, onEnd, startAt, seek, onDuration }: VideoProps) {
  const ref = useRef<VideoRef>(null);
  useEffect(() => {
    if (seek && Number.isFinite(seek.seconds)) ref.current?.seek(Math.max(0, seek.seconds));
  }, [seek]);
  return (
    <RNVideo
      ref={ref}
      key={url}
      source={{ uri: url, startPosition: startAt && startAt > 0 ? Math.round(startAt * 1000) : undefined }}
      style={[{ backgroundColor: '#000' }, style]}
      resizeMode="contain"
      muted={muted}
      paused={paused}
      progressUpdateInterval={500}
      onLoad={(e) => (e.duration > 0 ? onDuration?.(e.duration) : undefined)}
      onProgress={onProgress ? (e) => onProgress(e.currentTime) : undefined}
      onEnd={onEnd}
      focusable={false}
      disableFocus
      onReadyForDisplay={onPlaying}
      onBuffer={(e) => onBuffering?.(e.isBuffering)}
      onError={(e) => onError?.(e.error.errorString ?? e.error.localizedDescription ?? 'Playback error')}
    />
  );
}
