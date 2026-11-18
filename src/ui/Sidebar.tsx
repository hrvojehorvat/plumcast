import { router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { DefaultFocus, SpatialNavigationView } from 'react-tv-space-navigation';
import { NAV_ITEMS, navKeyForPath } from '../core/nav';
import { Focusable } from './Focusable';
import { useI18n } from './i18n';
import { Icon } from './Icon';
import { LogoMark } from './Logo';
import { colors, radius } from './tokens';

/** TV / desktop navigation rail (80 px), as in the TV mockups. */
export function Sidebar() {
  const { t } = useI18n();
  const active = navKeyForPath(usePathname());

  return (
    <View style={styles.rail}>
      <View style={styles.logo}>
        <LogoMark size={38} />
      </View>
      <SpatialNavigationView direction="vertical" style={styles.items}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <DefaultFocus key={item.key} enable={isActive}>
              <Focusable accessibilityLabel={t(`nav.${item.key}`)} onSelect={() => router.navigate(item.href)}>
                {({ isFocused }) => (
                  <View
                    style={[
                      styles.item,
                      isActive && { backgroundColor: colors.accentSoft },
                      isFocused && styles.focused,
                    ]}
                  >
                    <Icon name={item.key} color={isActive || isFocused ? colors.accentLight : colors.textFaint} />
                  </View>
                )}
              </Focusable>
            </DefaultFocus>
          );
        })}
      </SpatialNavigationView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 80,
    paddingVertical: 28,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  logo: { marginBottom: 22 },
  items: { gap: 8, alignItems: 'center' },
  item: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
});
