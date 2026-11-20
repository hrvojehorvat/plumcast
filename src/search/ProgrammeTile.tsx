import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { canReplay } from '../core/catchup';
import { formatDay } from '../core/format';
import { useNow } from '../data/epg';
import type { AiredItem } from '../data/live';
import { ChannelLogo } from '../live/ChannelRow';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useTimeFormat } from '../ui/useTimeFormat';

export const PROGRAMME_TILE = 132;

/** A found programme: when (or "On now" / replay), title, channel. */
export const ProgrammeTile = memo(function ProgrammeTile({ item, width, focused }: { item: AiredItem; width: number; focused: boolean }) {
  const { t, lang } = useI18n();
  const time = useTimeFormat();
  const now = useNow(30_000);
  const { channel, programme } = item;
  const live = programme.start <= now && now < programme.end;
  const replay = programme.end <= now && canReplay(channel, programme, now);
  const when = `${formatDay(programme.start, lang)} · ${time(programme.start)}–${time(programme.end)}`;
  return (
    <View style={[styles.tile, { width }, focused && styles.focused]}>
      <View style={styles.when}>
        {live ? (
          <View style={styles.badge}>
            <Text size={11} weight="semibold" color="#ffffff">{t('guide.onNow').toUpperCase()}</Text>
          </View>
        ) : replay ? (
          <Icon name="archive" size={14} color={colors.accentLight} />
        ) : null}
        <Text size={12} numberOfLines={1} color={replay ? colors.accentLight : colors.textMuted} style={styles.shrink}>{when}</Text>
      </View>
      <Text weight="semibold" size={15} numberOfLines={2} color={focused ? colors.text : colors.textSoft}>{programme.title}</Text>
      <View style={styles.channel}>
        <ChannelLogo channel={channel} width={36} height={24} />
        <Text size={12} numberOfLines={1} color={colors.textMuted} style={styles.shrink}>{channel.name}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    height: PROGRAMME_TILE,
    padding: 12,
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glass,
  },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.accent },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shrink: { flexShrink: 1 },
});
