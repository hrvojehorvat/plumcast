import { CurrentMark } from '../ui/CurrentMark';
import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { Channel } from '../data/live';
import { useNowNext } from '../data/epg';
import type { Playlist } from '../data/playlists';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';

export const ROW_HEIGHT = 50;
export const ROW_GAP = 6;

/** Channel logo on a soft tile; the first letter when there is no logo. */
export function ChannelLogo({ channel, width = 44, height = 30 }: { channel: Channel; width?: number; height?: number }) {
  return (
    <View style={[styles.logoBox, { width, height }]}>
      {channel.logo ? (
        <Image source={{ uri: channel.logo }} resizeMethod="resize" style={{ width: width - 8, height: height - 8 }} resizeMode="contain" />
      ) : (
        <Text weight="bold" size={14} color={colors.textMuted}>{channel.name.slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
}

/** Number, logo, name, what is on now with a progress bar, favourite / catch-up marks. */
export const ChannelRow = memo(function ChannelRow({
  channel,
  playlist,
  focused,
  active,
}: {
  channel: Channel;
  playlist: Playlist;
  focused: boolean;
  /** Playing in the preview. */
  active?: boolean;
}) {
  const info = useNowNext(playlist, channel.id);
  return (
    <View style={[styles.row, focused && styles.focused]}>
      {active && !focused ? <CurrentMark /> : null}
      <Text weight="semibold" size={11} color={colors.textFaint} style={styles.num}>
        {channel.num ?? ''}
      </Text>
      <ChannelLogo channel={channel} />
      <View style={styles.texts}>
        <Text weight="semibold" size={13} numberOfLines={1}>{channel.name}</Text>
        {info?.now ? (
          <View style={styles.nowLine}>
            <Text size={11} color={colors.textMuted} numberOfLines={1} style={styles.nowTitle}>{info.now.title}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(info.progress * 100)}%` }]} />
            </View>
          </View>
        ) : null}
      </View>
      {channel.archive ? <Icon name="archive" size={14} color={colors.textFaint} /> : null}
      {channel.favorite ? <Icon name="star" size={14} color={colors.accentLight} filled /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    width: '100%',
    height: ROW_HEIGHT,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glass,
  },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  num: { width: 26, textAlign: 'right' },
  logoBox: { alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  nowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nowTitle: { flexShrink: 1 },
  track: { width: 40, height: 3, borderRadius: 2, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.accent },
});
