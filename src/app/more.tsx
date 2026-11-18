import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SpatialNavigationView } from 'react-tv-space-navigation';
import { NAV_ITEMS, PHONE_MORE } from '../core/nav';
import { Focusable } from '../ui/Focusable';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';

/** Phone "More" tab: the sections that don't fit in the bottom bar. */
export default function More() {
  const { t } = useI18n();
  return (
    <Screen title={t('nav.more')}>
      <SpatialNavigationView direction="vertical" style={styles.list}>
        {PHONE_MORE.map((key) => (
          <Focusable key={key} accessibilityLabel={t(`nav.${key}`)} onSelect={() => router.navigate(NAV_ITEMS.find((i) => i.key === key)!.href)}>
            {({ isFocused }) => (
              <View style={[styles.row, isFocused && styles.focused]}>
                <Icon name={key} color={colors.accentLight} />
                <Text weight="semibold" size={16}>{t(`nav.${key}`)}</Text>
              </View>
            )}
          </Focusable>
        ))}
      </SpatialNavigationView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glass,
  },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
});
