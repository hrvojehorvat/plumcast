import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SpatialNavigationView } from 'react-tv-space-navigation';
import { activePlaylist, usePlaylists } from '../data/store';
import { LanguageSettings, PlaybackSettings, StorageAndAbout } from '../settings/AppSettings';
import { GuideSettings } from '../settings/GuideSettings';
import { Button } from '../ui/Button';
import { Focusable } from '../ui/Focusable';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Row, Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';

export default function Settings() {
  const { t } = useI18n();
  const state = usePlaylists();
  const { list, activeId } = state;

  return (
    <Screen title={t('nav.settings')}>
      <Text weight="semibold" size={13} color={colors.textMuted} style={styles.label}>{t('settings.playlists').toUpperCase()}</Text>
      <SpatialNavigationView direction="vertical" style={styles.list}>
        {list.map((p) => (
          <Focusable key={p.id} accessibilityLabel={p.name} onSelect={() => router.navigate(`/playlists/${p.id}`)}>
            {({ isFocused }) => (
              <View style={[styles.row, isFocused && styles.focused]}>
                <View style={styles.rowText}>
                  <Text weight="semibold" size={16} numberOfLines={1}>{p.name}</Text>
                  <Text size={13} color={colors.textMuted} numberOfLines={1}>{t(`playlist.kind.${p.kind}`)}</Text>
                </View>
                {p.id === activeId ? (
                  <Text weight="semibold" size={12} color={colors.accentLighter} style={styles.badge}>{t('playlist.active')}</Text>
                ) : null}
                <Icon name="chevron" size={18} color={colors.textFaint} />
              </View>
            )}
          </Focusable>
        ))}
      </SpatialNavigationView>
      <Row>
        <Button variant={list.length ? 'secondary' : 'primary'} icon="plus" label={t('playlist.add')} onPress={() => router.navigate('/playlists/add')} />
      </Row>
      <LanguageSettings />
      <PlaybackSettings />
      <Text weight="semibold" size={13} color={colors.textMuted} style={[styles.label, styles.section]}>{t('settings.guide').toUpperCase()}</Text>
      <GuideSettings playlist={activePlaylist(state)} />
      <StorageAndAbout />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { letterSpacing: 1 },
  section: { marginTop: 16 },
  list: { gap: 6, maxWidth: 640 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glass,
  },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  rowText: { flex: 1, gap: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.accentSoft, overflow: 'hidden' },
});
