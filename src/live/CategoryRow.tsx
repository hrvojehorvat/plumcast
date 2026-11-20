import { CurrentMark } from '../ui/CurrentMark';
import { StyleSheet, View } from 'react-native';
import { FAVORITES, RECENT } from '../data/live';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import type { CategoryItem } from './useLive';

/** Height of one row in a category column (row plus gap). */
export const CATEGORY_ITEM = 52;

/** A live category in the left column (Live TV, TV guide). */
export function CategoryRow({ item, selected, focused }: { item: CategoryItem; selected: boolean; focused: boolean }) {
  const icon = item.id === FAVORITES ? 'star' : item.id === RECENT ? 'catchup' : null;
  return (
    <View style={[styles.category, focused && styles.focused]}>
      {selected && !focused ? <CurrentMark /> : null}
      {icon ? <Icon name={icon} size={16} color={selected || focused ? colors.accentLight : colors.textFaint} /> : null}
      <Text weight={selected ? 'semibold' : 'regular'} size={15} numberOfLines={1} color={focused ? colors.text : selected ? colors.accentLight : colors.textSoft} style={styles.flex}>
        {item.name}
      </Text>
      {item.count !== null ? <Text size={12} color={colors.textFaint}>{item.count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  category: {
    height: CATEGORY_ITEM - 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { backgroundColor: colors.accentSoft },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
});
