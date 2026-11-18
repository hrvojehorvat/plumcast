import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { colors } from './tokens';
import { useWideLayout } from './useWideLayout';

/** Page frame with the big tight headline from the mockups. */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[wide ? styles.wide : styles.narrow, !wide && { paddingTop: insets.top + 16 }]}
    >
      <Text weight="bold" size={wide ? 34 : 30} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  wide: { paddingHorizontal: 48, paddingVertical: 40 },
  narrow: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { letterSpacing: -1 },
  body: { marginTop: 16, gap: 16 },
});
