import RNVideo from 'react-native-video';
import type { VideoProps } from './types';

/** Android / Fire TV playback through Media3 (ExoPlayer): HLS, MPEG-TS, MP4, MKV. */
export function Video({ url, muted, style, onPlaying, onBuffering, onError }: VideoProps) {
  return (
    <RNVideo
      key={url}
      source={{ uri: url }}
      style={[{ backgroundColor: '#000' }, style]}
      resizeMode="contain"
      muted={muted}
      focusable={false}
      disableFocus
      onReadyForDisplay={onPlaying}
      onBuffer={(e) => onBuffering?.(e.isBuffering)}
      onError={(e) => onError?.(e.error.errorString ?? e.error.localizedDescription ?? 'Playback error')}
    />
  );
}
