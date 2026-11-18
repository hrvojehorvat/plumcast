import { router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpatialNavigationView } from 'react-tv-space-navigation';
import type { MessageKey } from '../core/i18n';
import { NAV_ITEMS, PHONE_TABS, navKeyForPath, type NavKey } from '../core/nav';
import { Focusable } from './Focusable';
import { useI18n } from './i18n';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from './tokens';

const TAB_LABEL: Partial<Record<NavKey, MessageKey>> = { live: 'tab.live', guide: 'tab.guide' };

/** Phone bottom tabs: Home, Live, Guide, Movies, More. */
export function TabBar() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const current = navKeyForPath(usePathname());
  const activeTab = PHONE_TABS.includes(current as NavKey) ? current : 'more';

  const tabs = [
    ...PHONE_TABS.map((key) => ({
      key: key as NavKey | 'more',
      label: t(TAB_LABEL[key] ?? `nav.${key}`),
      href: NAV_ITEMS.find((i) => i.key === key)!.href as string,
    })),
    { key: 'more' as const, label: t('nav.more'), href: '/more' },
  ];

  return (
    <SpatialNavigationView direction="horizontal" style={{ ...styles.bar, paddingBottom: Math.max(insets.bottom, 10) }}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Focusable key={tab.key} style={styles.tab} accessibilityLabel={tab.label} onSelect={() => router.navigate(tab.href)}>
            {({ isFocused }) => {
              const color = isActive || isFocused ? colors.accentLight : colors.textFaint;
              return (
                <View style={styles.inner}>
                  <Icon name={tab.key} color={color} />
                  <Text weight="semibold" size={11} color={color}>{tab.label}</Text>
                </View>
              );
            }}
          </Focusable>
        );
      })}
    </SpatialNavigationView>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(18,15,26,0.92)',
  },
  tab: { flex: 1 },
  inner: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
