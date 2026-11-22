import type { StyleProp, TextStyle } from 'react-native';
import type { Playlist } from '../data/playlists';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';
import { useGuideStatusLine } from './useGuideScreen';

/**
 * The guide's status line (downloading 12.3 MB…, updated, failed). Its own component: download
 * progress changes several times a second, and only this line should redraw, not the guide grid.
 */
export function GuideStatusText({ playlist, size, lines, style }: { playlist: Playlist; size: number; lines: number; style?: StyleProp<TextStyle> }) {
  const line = useGuideStatusLine(playlist);
  if (!line.text) return null;
  return (
    <Text size={size} color={line.problem ? '#ffc9c9' : colors.textFaint} numberOfLines={lines} style={style}>
      {line.text}
    </Text>
  );
}
