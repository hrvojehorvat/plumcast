import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpatialNavigationView } from 'react-tv-space-navigation';
import { ArchivePane } from '../../catchup/ArchivePane';
import { replayDays } from '../../core/catchup';
import { getChannel, useLiveVersion } from '../../data/live';
import { activePlaylist, usePlaylists } from '../../data/store';
import { ChannelLogo } from '../../live/ChannelRow';
import { Button } from '../../ui/Button';
import { useI18n } from '../../ui/i18n';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';
import { colors } from '../../ui/tokens';
import { useQuery } from '../../ui/useQuery';
import { useWideLayout } from '../../ui/useWideLayout';

const leave = () => (router.canGoBack() ? router.back() : router.navigate('/catchup'));

/** One channel's replays (opened from the Catch-up list, Live TV or the player). */
export default function ChannelCatchup() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ channel: string }>();
  const id = typeof params.channel === 'string' ? params.channel : '';
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  const version = useLiveVersion();
  const channel = useQuery(playlist && id ? `${playlist.id}|${playlist.syncedAt ?? 0}|${id}` : null, () => getChannel(playlist!.id, id), version);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, []);

  if (!state.ready) return null;

  return (
    <SpatialNavigationView direction="vertical" style={{ ...styles.root, ...(wide ? styles.wide : { paddingTop: insets.top + 12 }) }}>
      <View style={[styles.head, !wide && styles.phonePad]}>
        {wide ? (
          <Button icon="back" label={t('catchup.back')} onPress={leave} />
        ) : (
          <Pressable accessibilityLabel={t('catchup.back')} onPress={leave} hitSlop={10}>
            <Icon name="back" size={24} color={colors.text} />
          </Pressable>
        )}
        {channel ? <ChannelLogo channel={channel} /> : null}
        <View style={styles.flex}>
          <Text weight="bold" size={wide ? 28 : 22} numberOfLines={1} style={styles.title}>{channel?.name ?? t('nav.catchup')}</Text>
          {channel ? <Text size={13} color={colors.textFaint}>{t('catchup.days', { n: replayDays(channel) })}</Text> : null}
        </View>
      </View>
      {channel === undefined ? (
        <Text size={14} color={colors.textMuted} style={!wide && styles.phonePad}>{t('catchup.loading')}</Text>
      ) : !playlist || !channel || replayDays(channel) === 0 ? (
        <Text size={14} color={colors.textMuted} style={!wide && styles.phonePad}>{t('catchup.channelMissing')}</Text>
      ) : (
        <ArchivePane playlist={playlist} channel={channel} list={null} wide={wide} autoFocus />
      )}
    </SpatialNavigationView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  root: { flex: 1, gap: 16, backgroundColor: colors.bg },
  wide: { paddingHorizontal: 32, paddingTop: 32, paddingBottom: 24, maxWidth: 1000 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  phonePad: { paddingHorizontal: 20 },
  title: { letterSpacing: -0.5 },
});
