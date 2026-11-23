import { StyleSheet, View } from 'react-native';
import { statsLines, type PlaybackStats } from '../core/playbackStats';
import { Text } from '../ui/Text';

/**
 * Playback stats in the top-left corner (Settings → Playback, or the player's Stats button). Small text
 * without a box, so the film stays visible; a dark outline keeps it readable on light, dark and colourful
 * pictures alike. Never in the way of the controls.
 */
export function Stats({ stats, level, averageBps }: { stats: PlaybackStats; level: string | null; averageBps: number | null }) {
  return (
    <View style={styles.box} pointerEvents="none">
      {statsLines(stats, level, averageBps).map((line, i) => (
        <Text key={i} size={8} weight="medium" color="rgba(255,255,255,0.85)" style={styles.line}>{line}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 10, left: 12 },
  line: {
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
});
