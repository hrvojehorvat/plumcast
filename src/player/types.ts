import type { ViewStyle } from 'react-native';

export interface VideoProps {
  /** Stream URL (already a playable link). Changing it starts the new stream. */
  url: string;
  muted?: boolean;
  /** Live streams keep up with the live edge; replays play like a file. Default true. */
  live?: boolean;
  paused?: boolean;
  style?: ViewStyle;
  /** First frame is on screen. */
  onPlaying?: () => void;
  onBuffering?: (buffering: boolean) => void;
  /** The stream failed (network, codec, server refused). */
  onError?: (message: string) => void;
  /** Playback position in seconds, a few times a second. */
  onProgress?: (seconds: number) => void;
  /** A replay reached its end. */
  onEnd?: () => void;
}
