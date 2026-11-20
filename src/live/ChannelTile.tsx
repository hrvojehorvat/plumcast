import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNowNext } from '../data/epg';
import type { Channel } from '../data/live';
import type { Playlist } from '../data/playlists';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { ChannelLogo } from './ChannelRow';

/** Text under the tile: name and what is on now. */
const TILE_TEXT = 46;
export const tileHeight = (width: number) => Math.round((width * 9) / 16) + TILE_TEXT;

/** A channel card for rows (Home, Search): big logo, name, what is on now with a progress bar. */
export const ChannelTile = memo(function ChannelTile({ channel, playlist, width, focused }: { channel: Channel; playlist: Playlist; width: number; focused: boolean }) {
  const info = useNowNext(playlist, channel.id);
  const height = Math.round((width * 9) / 16);
  return (
    <View style={{ width }}>
      <View style={[styles.frame, { height }, focused && styles.focused]}>
        <ChannelLogo channel={channel} width={Math.round(width * 0.6)} height={Math.round(height * 0.6)} />
        {channel.favorite ? (
          <View style={styles.mark}>
            <Icon name="star" size={13} color={colors.accentLight} filled />
          </View>
        ) : null}
        {info?.now ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(info.progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      <Text weight="semibold" size={14} numberOfLines={1} color={focused ? colors.text : colors.textSoft} style={styles.name}>
        {channel.name}
      </Text>
      <Text size={12} numberOfLines={1} color={colors.textMuted}>{info?.now?.title ?? ' '}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glass,
    overflow: 'hidden',
  },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  mark: { position: 'absolute', top: 6, right: 6 },
  track: { position: 'absolute', left: 8, right: 8, bottom: 6, height: 3, borderRadius: 2, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.accent },
  name: { marginTop: 6 },
});
