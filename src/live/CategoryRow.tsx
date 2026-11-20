import { StyleSheet, View } from 'react-native';
import { CurrentMark } from '../ui/CurrentMark';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';

/** Height of one row in a category column (row plus gap). */
export const CATEGORY_ITEM = 40;

/**
 * A category in a left column (Live TV, Movies, Series, Catch-up, TV guide). The focused row gets the
 * fill and ring; the open category only a thin bar, so the remote focus never shows twice.
 */
export function CategoryRow({ name, count, icon, selected, focused }: { name: string; count: number | null; icon?: IconName | null; selected: boolean; focused: boolean }) {
  return (
    <View style={[styles.category, focused && styles.focused]}>
      {selected && !focused ? <CurrentMark /> : null}
      {icon ? <Icon name={icon} size={14} color={selected || focused ? colors.accentLight : colors.textFaint} /> : null}
      <Text weight={selected ? 'semibold' : 'regular'} size={13} numberOfLines={1} color={focused ? colors.text : selected ? colors.accentLight : colors.textSoft} style={styles.flex}>
        {name}
      </Text>
      {count !== null ? <Text size={11} color={colors.textFaint}>{count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  category: {
    height: CATEGORY_ITEM - 4,
    paddingLeft: 12,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
});
