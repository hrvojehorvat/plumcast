import { router, usePathname } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { DefaultFocus, SpatialNavigationView, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { NAV_ITEMS, navKeyForPath } from '../core/nav';
import { Focusable } from './Focusable';
import { useI18n } from './i18n';
import { Icon } from './Icon';
import { keyMark, openRight, sectionEntry, setBackStep, setMenuFocus } from './lastKey';
import { LogoMark } from './Logo';
import { colors, radius } from './tokens';
import { useLatest } from './useQuery';

/**
 * TV / desktop navigation rail. Moving the remote focus only moves the focus; OK opens the section and
 * moves into it. Coming into the rail from the page (◀ or Back) always lands on the current section, never
 * on the item the rail remembers from before.
 */
export function Sidebar() {
  const { t } = useI18n();
  const active = navKeyForPath(usePathname());
  const entry = useRailEntry(active);
  useEffect(() => {
    setMenuFocus(entry.focusCurrent);
    return () => setMenuFocus(null);
  }, [entry.focusCurrent]);

  // OK: open the section, then step into it once its page shows: a page with columns onto its selected
  // category (once that column is there; ▶ would skip a column still loading), any other page with ▶.
  const shown = useLatest(active);
  const open = (item: (typeof NAV_ITEMS)[number], isActive: boolean) => {
    if (!isActive) router.replace(item.href);
    openRight(keyMark(), () => {
      if (shown.current !== item.key) return 'wait';
      if (!item.columns) return 'right';
      const focusFirst = sectionEntry(item.key);
      return focusFirst?.() ? 'done' : 'wait';
    });
  };

  return (
    <View style={styles.rail}>
      <View style={styles.logo}>
        <LogoMark size={30} />
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
                    // Back in the menu works as usual (section → Home → leave the app).
                    setBackStep(null);
                    entry.focus(item.key);
                  }}
                  onBlur={entry.blur}
                  onSelect={() => open(item, isActive)}
                >
                  {({ isFocused }) => (
                    <View style={[styles.item, isFocused && styles.focused]}>
                      {isActive && !isFocused ? <View style={styles.current} /> : null}
                      <Icon name={item.key} size={20} color={isFocused ? colors.text : isActive ? colors.accentLight : colors.textFaint} />
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
 * Sends the focus to the current section when it comes into the rail from the page. Focus moves blur
 * the old item and focus the new one in the same tick, so a blur followed at once by a focus is a move
 * within the rail.
 */
function useRailEntry(active: string | null) {
  const nodes = useRef(new Map<string, SpatialNavigationNodeRef>());
  const refs = useRef(new Map<string, (node: SpatialNavigationNodeRef | null) => void>());
  const inside = useRef(false);
  const justLeft = useRef(false);
  const latest = useLatest(active);
  const focusCurrent = useCallback(() => {
    const current = latest.current;
    if (current) nodes.current.get(current)?.focus();
  }, [latest]);
  return {
    focusCurrent,
    isInside: () => inside.current,
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
    focus(key: string) {
      const entering = !inside.current && !justLeft.current;
      inside.current = true;
      justLeft.current = false;
      const current = latest.current;
      if (!entering || !current || key === current) return;
      const target = nodes.current.get(current);
      if (target) setTimeout(() => target.focus(), 0);
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
    width: 64,
    paddingVertical: 14,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  logo: { marginBottom: 12 },
  items: { gap: 4, alignItems: 'center' },
  item: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  divider: { width: 24, height: 1, marginVertical: 4, backgroundColor: colors.border },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  /** The open section, when the focus is elsewhere: a small bar on the left, no box (that would look like a second focus). */
  current: { position: 'absolute', left: -11, top: 12, bottom: 12, width: 3, borderRadius: 2, backgroundColor: colors.accentLight },
});
