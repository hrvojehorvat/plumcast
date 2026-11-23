import { StyleSheet, View } from 'react-native';
import type { BufferLevel } from '../core/buffer';
import { statsLines, type PlaybackStats } from '../core/playbackStats';
import { Text } from '../ui/Text';

/** Playback stats in the top-left corner (Settings → Playback). Small, and never in the way of the controls. */
export function Stats({ stats, level, averageBps }: { stats: PlaybackStats; level: BufferLevel | null; averageBps: number | null }) {
  return (
    <View style={styles.box} pointerEvents="none">
      {statsLines(stats, level, averageBps).map((line, i) => (
        <Text key={i} size={11} color="rgba(255,255,255,0.85)" style={styles.line}>{line}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  line: { fontVariant: ['tabular-nums'], lineHeight: 15 },
});
