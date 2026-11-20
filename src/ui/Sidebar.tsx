import { router, usePathname } from 'expo-router';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { DefaultFocus, SpatialNavigationView } from 'react-tv-space-navigation';
import { NAV_ITEMS, navKeyForPath } from '../core/nav';
import { Focusable } from './Focusable';
import { useI18n } from './i18n';
import { Icon } from './Icon';
import { LogoMark } from './Logo';
import { colors, radius } from './tokens';
import { useFocusSelect } from './useFocusSelect';

/** TV / desktop navigation rail (80 px). Resting the remote focus on an item opens that page, no OK needed. */
export function Sidebar() {
  const { t } = useI18n();
  const active = navKeyForPath(usePathname());
  const openOnFocus = useFocusSelect(active, (key: string) => {
    const item = NAV_ITEMS.find((i) => i.key === key);
    if (item) router.replace(item.href);
  });

  return (
    <View style={styles.rail}>
      <View style={styles.logo}>
        <LogoMark size={38} />
      </View>
      <SpatialNavigationView direction="vertical" style={styles.items}>
        {NAV_ITEMS.map((item, i) => {
          const isActive = item.key === active;
          return (
            <Fragment key={item.key}>
              {item.tool && !NAV_ITEMS[i - 1]?.tool ? <View style={styles.divider} /> : null}
              <DefaultFocus enable={isActive}>
                <Focusable accessibilityLabel={t(`nav.${item.key}`)} onFocus={() => openOnFocus.onFocus(item.key)} onBlur={() => openOnFocus.onBlur(item.key)} onSelect={() => router.replace(item.href)}>
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
            </Fragment>
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
  divider: { width: 28, height: 1, marginVertical: 6, backgroundColor: colors.border },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
});
