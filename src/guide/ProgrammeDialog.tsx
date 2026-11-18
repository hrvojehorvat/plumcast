import { StyleSheet, View } from 'react-native';
import type { Programme } from '../core/epg';
import { formatDay } from '../core/format';
import { useNow } from '../data/epg';
import type { Channel } from '../data/live';
import { Dialog } from '../ui/Dialog';
import { useI18n } from '../ui/i18n';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useTimeFormat } from '../ui/useTimeFormat';

/** Details of one programme with "Watch live" (catch-up joins in the next phase). */
export function ProgrammeDialog({ channel, programme, onWatch, onClose }: { channel: Channel; programme: Programme; onWatch: () => void; onClose: () => void }) {
  const { t, lang } = useI18n();
  const time = useTimeFormat();
  const now = useNow(15_000);
  const live = programme.start <= now && now < programme.end;
  const ended = programme.end <= now;
  const minutes = Math.round((programme.end - programme.start) / 60_000);

  return (
    <Dialog
      onClose={onClose}
      actions={[
        { label: t('guide.watchLive'), icon: 'play', primary: true, onPress: onWatch },
        { label: t('player.close'), icon: 'close', onPress: onClose },
      ]}
    >
      <Text size={13} weight="semibold" color={colors.accentLight} numberOfLines={1}>
        {channel.num !== null ? `${channel.num}  ` : ''}{channel.name}
      </Text>
      <Text size={24} weight="bold" style={styles.title}>{programme.title}</Text>
      <View style={styles.meta}>
        {live ? (
          <View style={styles.badge}>
            <Text size={12} weight="semibold" color="#ffffff">{t('guide.onNow').toUpperCase()}</Text>
          </View>
        ) : ended ? (
          <Text size={13} color={colors.textFaint}>{t('guide.ended')} ·</Text>
        ) : null}
        <Text size={14} color={colors.textSoft}>
          {formatDay(programme.start, lang)} · {time(programme.start)}–{time(programme.end)} · {t('guide.minutes', { n: minutes })}
        </Text>
      </View>
      {live ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(((now - programme.start) / (programme.end - programme.start)) * 100)}%` }]} />
        </View>
      ) : null}
      {programme.description ? (
        <Text size={15} color={colors.textSoft} numberOfLines={9} style={styles.description}>{programme.description}</Text>
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  title: { letterSpacing: -0.5, lineHeight: 30 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.live },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  description: { lineHeight: 22 },
});
