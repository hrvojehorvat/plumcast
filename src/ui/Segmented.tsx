import { StyleSheet, View } from 'react-native';
import { SpatialNavigationView } from 'react-tv-space-navigation';
import { Focusable } from './Focusable';
import { Text } from './Text';
import { colors, radius } from './tokens';

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Smaller, for the narrow TV side column. */
  compact?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

/** A row of exclusive choices (Xtream / M3U link / M3U file). */
export function Segmented<T extends string>({ options, value, onChange, compact, onFocus, onBlur }: Props<T>) {
  return (
    <SpatialNavigationView direction="horizontal" style={compact ? { ...styles.row, ...styles.rowCompact } : styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Focusable key={option.value} accessibilityLabel={option.label} onSelect={() => onChange(option.value)} onFocus={onFocus} onBlur={onBlur}>
            {({ isFocused }) => (
              <View style={[styles.item, compact && styles.itemCompact, selected && styles.selected, isFocused && styles.focused]}>
                <Text weight="semibold" size={compact ? 12 : 14} color={selected ? colors.text : colors.textMuted}>
                  {option.label}
                </Text>
              </View>
            )}
          </Focusable>
        );
      })}
    </SpatialNavigationView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 4, alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: colors.glass },
  item: { height: 38, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 2, borderColor: 'transparent' },
  rowCompact: { gap: 2, padding: 3 },
  itemCompact: { height: 30, paddingHorizontal: 10 },
  selected: { backgroundColor: colors.accentSoft },
  focused: { borderColor: colors.focusRing },
});
