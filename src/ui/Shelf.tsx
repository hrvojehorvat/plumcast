import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { DefaultFocus, SpatialNavigationScrollView, SpatialNavigationView } from 'react-tv-space-navigation';
import { Focusable } from './Focusable';
import { Text } from './Text';
import { colors } from './tokens';

/**
 * A titled horizontal row of cards (Home, Search). ◀▶ moves along it and the row scrolls with
 * the focus; ▲▼ moves between rows. `height` is the card height: a horizontal scroll view
 * would otherwise grow to fill the screen.
 */
export function Shelf<T>({
  title,
  items,
  height,
  keyOf,
  labelOf,
  onSelect,
  children,
  defaultFocus,
  note,
}: {
  title: string;
  items: readonly T[];
  height: number;
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  onSelect: (item: T) => void;
  children: (item: T, focused: boolean) => ReactElement;
  /** Puts the remote focus on the first card when the screen opens. */
  defaultFocus?: boolean;
  /** Small text after the title (e.g. a count). */
  note?: string;
}) {
  return (
    <View style={styles.shelf}>
      <View style={styles.head}>
        <Text weight="semibold" size={18}>{title}</Text>
        {note ? <Text size={13} color={colors.textMuted}>{note}</Text> : null}
      </View>
      <View style={{ height: height + 8 }}>
        <SpatialNavigationScrollView horizontal useNativeScroll offsetFromStart={40} style={styles.scroll}>
          <SpatialNavigationView direction="horizontal" style={styles.row}>
            {items.map((item, i) => {
              const card = (
                <Focusable key={keyOf(item)} accessibilityLabel={labelOf(item)} onSelect={() => onSelect(item)}>
                  {({ isFocused }) => children(item, isFocused)}
                </Focusable>
              );
              return i === 0 && defaultFocus ? <DefaultFocus key={keyOf(item)}>{card}</DefaultFocus> : card;
            })}
          </SpatialNavigationView>
        </SpatialNavigationScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 4 },
});
