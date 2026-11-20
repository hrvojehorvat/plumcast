import { StyleSheet, View } from 'react-native';
import { colors } from './tokens';

/**
 * The thin accent bar at the left edge of a list row that is selected / playing but not focused.
 * Only the focused row gets a fill and ring, so the remote focus is never shown twice.
 */
export function CurrentMark() {
  return <View pointerEvents="none" style={styles.mark} />;
}

const styles = StyleSheet.create({
  mark: { position: 'absolute', left: 3, top: '25%', bottom: '25%', width: 3, borderRadius: 2, backgroundColor: colors.accentLight },
});
