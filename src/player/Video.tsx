import RNVideo from 'react-native-video';
import type { VideoProps } from './types';

/** Android / Fire TV playback through Media3 (ExoPlayer): HLS, MPEG-TS, MP4, MKV. */
export function Video({ url, muted, paused, style, onPlaying, onBuffering, onError, onProgress, onEnd }: VideoProps) {
  return (
    <RNVideo
      key={url}
      source={{ uri: url }}
      style={[{ backgroundColor: '#000' }, style]}
      resizeMode="contain"
      muted={muted}
      paused={paused}
      progressUpdateInterval={500}
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
