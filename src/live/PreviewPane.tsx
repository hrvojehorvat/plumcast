import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTimeFormat } from '../ui/useTimeFormat';
import type { Channel } from '../data/live';
import { useNowNext } from '../data/epg';
import type { Playlist } from '../data/playlists';
import { Video } from '../player/Video';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { ChannelLogo } from './ChannelRow';
import { useStreamUrl } from './useLive';

/**
 * Right-hand pane: the channel picked with OK plays small (otherwise the focused one is shown, not
 * played), with what is on now and next.
 * `playing` is false while the full-screen player is open (one stream at a time).
 */
export function PreviewPane({ playlist, channel, playing }: { playlist: Playlist; channel: Channel | null; playing: boolean }) {
  const { t } = useI18n();
  const formatTime = useTimeFormat();
  const url = useStreamUrl(playlist, playing ? channel : null);
  const info = useNowNext(playlist, channel?.id ?? null);
  const [state, setState] = useState<{ url: string | null; status: 'loading' | 'playing' | 'failed' }>({ url: null, status: 'loading' });
  const status = state.url === url ? state.status : 'loading';

  return (
    <View style={styles.pane}>
      <View style={styles.video}>
        {url ? (
          <Video
            url={url}
            style={StyleSheet.absoluteFill}
            onPlaying={() => setState({ url, status: 'playing' })}
            onError={() => setState({ url, status: 'failed' })}
          />
        ) : null}
        {channel && status !== 'playing' ? (
          <View style={styles.videoCover} pointerEvents="none">
            {status === 'failed' ? (
              <>
                <Icon name="alert" size={24} color="#ff8787" />
                <Text size={12} color={colors.textMuted} style={styles.centerText}>{t('player.error')}</Text>
              </>
            ) : url ? (
              <ActivityIndicator color={colors.accentLight} />
            ) : (
              <Icon name="play" size={24} color={colors.textFaint} />
            )}
          </View>
        ) : null}
      </View>

      {channel ? (
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <ChannelLogo channel={channel} width={48} height={32} />
            <View style={styles.flex}>
              <Text weight="bold" size={15} numberOfLines={1}>{channel.name}</Text>
              <Text size={11} color={colors.textFaint} numberOfLines={1}>
                {[channel.num, channel.archive ? t('live.catchupDays', { n: channel.archiveDays }) : null].filter((x) => x !== null).join(' · ')}
              </Text>
            </View>
          </View>
          {info?.now ? (
            <View style={styles.block}>
              <Text weight="semibold" size={10} color={colors.accentLight}>
                {t('live.now').toUpperCase()} · {formatTime(info.now.start)}–{formatTime(info.now.end)}
              </Text>
              <Text weight="semibold" size={13} numberOfLines={1}>{info.now.title}</Text>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(info.progress * 100)}%` }]} /></View>
              {info.now.description ? (
                <Text size={12} color={colors.textSoft} numberOfLines={3} style={styles.desc}>{info.now.description}</Text>
              ) : null}
            </View>
          ) : (
            <Text size={12} color={colors.textMuted}>{t('live.noGuide')}</Text>
          )}
          {info?.next ? (
            <View style={styles.block}>
              <Text weight="semibold" size={10} color={colors.textMuted}>
                {t('live.next').toUpperCase()} · {formatTime(info.next.start)}
              </Text>
              <Text size={12} color={colors.textSoft} numberOfLines={1}>{info.next.title}</Text>
            </View>
          ) : null}
          <Text size={11} color={colors.textFaint}>{t(playing ? 'live.previewHint' : 'live.previewStart')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flexBasis: 280, flexShrink: 1, minWidth: 170, gap: 10, paddingTop: 2 },
  flex: { flex: 1 },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: colors.border },
  videoCover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  centerText: { textAlign: 'center' },
  info: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  block: { gap: 4 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  desc: { lineHeight: 16 },
});
