import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { DefaultFocus, SpatialNavigationView } from 'react-tv-space-navigation';
import { formatNumber } from '../core/format';
import type { Playlist } from '../data/playlists';
import { Focusable } from '../ui/Focusable';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useWideLayout } from '../ui/useWideLayout';

const LINKS = [
  { key: 'live', href: '/live' },
  { key: 'movies', href: '/movies' },
  { key: 'series', href: '/series' },
  { key: 'catchup', href: '/catchup' },
] as const;

/** Big tiles at the top of Home for the main sections. The remote focus starts on the first. */
export function QuickLinks({ playlist }: { playlist: Playlist }) {
  const { t, lang } = useI18n();
  const wide = useWideLayout();
  const counts = playlist.counts;
  const countOf = (key: (typeof LINKS)[number]['key']) => (key === 'catchup' || !counts ? null : formatNumber(counts[key], lang));

  return (
    <SpatialNavigationView direction="horizontal" style={wide ? styles.row : styles.rowWrap}>
      {LINKS.map((link, i) => {
        const tile = (
          <Focusable key={link.key} accessibilityLabel={t(`nav.${link.key}`)} onSelect={() => router.navigate(link.href)} style={wide ? styles.cellWide : styles.cell}>
            {({ isFocused }) => (
              <View style={[styles.tile, !wide && styles.tileSmall, isFocused && styles.focused]}>
                <View style={[styles.icon, !wide && styles.iconSmall, isFocused && styles.iconFocused]}>
                  <Icon name={link.key} size={wide ? 26 : 20} color={isFocused ? colors.onLight : colors.accentLight} />
                </View>
                <View style={styles.text}>
                  <Text weight="semibold" size={wide ? 18 : 16} numberOfLines={1}>{t(`nav.${link.key}`)}</Text>
                  {countOf(link.key) ? <Text size={13} color={colors.textMuted} numberOfLines={1}>{countOf(link.key)}</Text> : null}
                </View>
              </View>
            )}
          </Focusable>
        );
        return i === 0 ? <DefaultFocus key={link.key}>{tile}</DefaultFocus> : tile;
      })}
    </SpatialNavigationView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cellWide: { flex: 1, minWidth: 0 },
  cell: { width: '47%' },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    borderWidth: 2,
    borderColor: colors.border,
  },
  tileSmall: { gap: 10, padding: 12 },
  focused: { backgroundColor: colors.accentSoft, borderColor: colors.focusRing },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  iconSmall: { width: 38, height: 38 },
  iconFocused: { backgroundColor: colors.accentLight },
  text: { flex: 1, minWidth: 0, gap: 2 },
});
