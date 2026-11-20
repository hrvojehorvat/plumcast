import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpatialNavigationScrollView, SpatialNavigationView } from 'react-tv-space-navigation';
import { Text } from './Text';
import { colors, tv } from './tokens';
import { useWideLayout } from './useWideLayout';

/**
 * Page frame with the big tight headline from the mockups. The body is a vertical focus
 * column (D-pad down moves through it) inside a scroll view that follows the focus.
 */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  return (
    <SpatialNavigationScrollView
      useNativeScroll
      offsetFromStart={120}
      style={styles.root}
      contentContainerStyle={wide ? styles.wide : { ...styles.narrow, paddingTop: insets.top + 16 }}
    >
      <Text weight="bold" size={wide ? tv.title + 4 : 30} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <SpatialNavigationView direction="vertical" style={styles.body}>
        {children}
      </SpatialNavigationView>
    </SpatialNavigationScrollView>
  );
}

/** A horizontal focus row (buttons side by side). */
export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <SpatialNavigationView direction="horizontal" style={{ ...styles.row, ...style }}>
      {children}
    </SpatialNavigationView>
  );
}

/** Glass card. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  wide: { paddingHorizontal: tv.padX + 8, paddingTop: tv.padTop, paddingBottom: 32 },
  narrow: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { letterSpacing: -1 },
  body: { marginTop: 16, gap: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    maxWidth: 640,
    padding: 20,
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
});
