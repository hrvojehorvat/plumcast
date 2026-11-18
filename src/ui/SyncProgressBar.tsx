import { StyleSheet, View } from 'react-native';
import type { SyncProgress } from '../data/sync';
import { useI18n } from './i18n';
import { Text } from './Text';
import { colors, radius } from './tokens';

/** "Loading channels…" with a thin bar. */
export function SyncProgressBar({ progress }: { progress: SyncProgress }) {
  const { t } = useI18n();
  const share = Math.min(1, (progress.index + 0.5) / progress.total);
  return (
    <View style={styles.wrap}>
      <Text size={14} color={colors.textSoft}>
        {t(`sync.step.${progress.step}`)}…
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, maxWidth: 560 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
});
