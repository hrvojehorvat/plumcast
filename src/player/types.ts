import type { ViewStyle } from 'react-native';

export interface VideoProps {
  /** Stream URL (already a playable link). Changing it starts the new stream. */
  url: string;
  muted?: boolean;
  style?: ViewStyle;
  /** First frame is on screen. */
  onPlaying?: () => void;
  onBuffering?: (buffering: boolean) => void;
  /** The stream failed (network, codec, server refused). */
  onError?: (message: string) => void;
}
