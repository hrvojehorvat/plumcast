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
  /** A replay or movie reached its end. */
  onEnd?: () => void;
  /** Files (movies): start here, in seconds, once the file is open. */
  startAt?: number;
  /** Files: jump within the open file. A new object (even with the same seconds) seeks again. */
  seek?: { seconds: number } | null;
  /** Files: length in seconds once known. */
  onDuration?: (seconds: number) => void;
}
