import { router, usePathname } from 'expo-router';
import { Fragment, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { DefaultFocus, SpatialNavigationView, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { NAV_ITEMS, navKeyForPath } from '../core/nav';
import { Focusable } from './Focusable';
import { useI18n } from './i18n';
import { Icon } from './Icon';
import { LogoMark } from './Logo';
import { colors, radius } from './tokens';
import { useFocusSelect } from './useFocusSelect';
import { useLatest } from './useQuery';

/**
 * TV / desktop navigation rail (80 px). Resting the remote focus on an item opens that page, no OK needed.
 * Coming into the rail from the page (◀) always lands on the current section, never on the item the rail
 * remembers from before (that would open another section by itself).
 */
export function Sidebar() {
  const { t } = useI18n();
  const active = navKeyForPath(usePathname());
  const openOnFocus = useFocusSelect(active, (key: string) => {
    const item = NAV_ITEMS.find((i) => i.key === key);
    if (item) router.replace(item.href);
  });
  const entry = useRailEntry(active);

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
                <Focusable
                  accessibilityLabel={t(`nav.${item.key}`)}
                  focusRef={entry.ref(item.key)}
                  onFocus={() => {
                    if (entry.focus(item.key)) openOnFocus.onFocus(item.key);
                  }}
                  onBlur={() => {
                    entry.blur();
                    openOnFocus.onBlur(item.key);
                  }}
                  onSelect={() => router.replace(item.href)}
                >
                  {({ isFocused }) => (
                    <View style={[styles.item, isFocused && styles.focused]}>
                      {isActive && !isFocused ? <View style={styles.current} /> : null}
                      <Icon name={item.key} color={isFocused ? colors.text : isActive ? colors.accentLight : colors.textFaint} />
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

/**
 * Tracks whether the remote focus is already inside the rail. Focus moves blur the old item and focus the
 * new one in the same tick, so a blur followed at once by a focus is a move within the rail.
 * `focus(key)` returns false when the move was redirected to the current section.
 */
function useRailEntry(active: string | null) {
  const nodes = useRef(new Map<string, SpatialNavigationNodeRef>());
  const refs = useRef(new Map<string, (node: SpatialNavigationNodeRef | null) => void>());
  const inside = useRef(false);
  const justLeft = useRef(false);
  const latest = useLatest(active);
  return {
    ref(key: string) {
      let ref = refs.current.get(key);
      if (!ref) {
        ref = (node) => {
          if (node) nodes.current.set(key, node);
          else nodes.current.delete(key);
        };
        refs.current.set(key, ref);
      }
      return ref;
    },
    focus(key: string): boolean {
      const entering = !inside.current && !justLeft.current;
      inside.current = true;
      justLeft.current = false;
      const current = latest.current;
      if (!entering || !current || key === current) return true;
      const target = nodes.current.get(current);
      if (!target) return true;
      setTimeout(() => target.focus(), 0);
      return false;
    },
    blur() {
      inside.current = false;
      justLeft.current = true;
      queueMicrotask(() => {
        justLeft.current = false;
      });
    },
  };
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
  /** The open section, when the focus is elsewhere: a small bar on the left, no box (that would look like a second focus). */
  current: { position: 'absolute', left: -14, top: 14, bottom: 14, width: 3, borderRadius: 2, backgroundColor: colors.accentLight },
});
