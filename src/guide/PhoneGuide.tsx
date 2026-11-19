import { useEffect, useMemo, useState } from 'react';
import { BackHandler, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canReplay } from '../core/catchup';
import type { Programme } from '../core/epg';
import { formatDay } from '../core/format';
import { addDays } from '../core/guide';
import { useNow } from '../data/epg';
import type { Channel } from '../data/live';
import type { Playlist } from '../data/playlists';
import { ChannelRow, ROW_GAP, ROW_HEIGHT } from '../live/ChannelRow';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useTimeFormat } from '../ui/useTimeFormat';
import { ProgrammeDialog } from './ProgrammeDialog';
import { useChannelProgrammes } from './useGuide';
import { useGuideScreen, useGuideStatusLine } from './useGuideScreen';

/** Phones: pick a day and a category, tap a channel to see its programmes for that day. */
export function PhoneGuide({ playlist }: { playlist: Playlist }) {
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const guide = useGuideScreen(playlist);
  const line = useGuideStatusLine(playlist);
  const [open, setOpen] = useState<Channel | null>(null);

  // Android back closes the channel's programme list first.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(null);
      return true;
    });
    return () => sub.remove();
  }, [open]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        {open ? (
          <Pressable accessibilityLabel={t('guide.channelList')} onPress={() => setOpen(null)} hitSlop={10}>
            <Icon name="back" size={24} color={colors.text} />
          </Pressable>
        ) : null}
        <Text weight="bold" size={open ? 24 : 30} numberOfLines={1} style={styles.title}>{open ? open.name : t('nav.guide')}</Text>
      </View>
      {line.text ? (
        <Text size={12} color={line.problem ? '#ffc9c9' : colors.textFaint} numberOfLines={2} style={styles.status}>{line.text}</Text>
      ) : null}

      <Chips>
        {guide.days.map((d) => (
          <Chip key={d} label={d === guide.today ? t('guide.today') : formatDay(d, lang)} on={d === guide.day} onPress={() => guide.setDay(d)} />
        ))}
      </Chips>

      {open ? (
        <DayList playlist={playlist} channel={open} day={guide.day} onOpen={(programme) => guide.setDetail({ channel: open, programme })} />
      ) : (
        <>
          <Chips>
            {guide.categories?.map((c) => (
              <Chip key={c.id} label={c.name} on={c.id === guide.selected} onPress={() => guide.selectCategory(c.id)} />
            ))}
          </Chips>
          {guide.channels && guide.channels.length === 0 ? (
            <Text size={14} color={colors.textMuted} style={styles.empty}>{t('live.noChannels')}</Text>
          ) : (
            <FlatList
              data={guide.channels ?? []}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Pressable onPress={() => setOpen(item)} accessibilityLabel={item.name}>
                  <ChannelRow channel={item} playlist={playlist} focused={false} />
                </Pressable>
              )}
              getItemLayout={(_, index) => ({ length: ROW_HEIGHT + ROW_GAP, offset: (ROW_HEIGHT + ROW_GAP) * index, index })}
              ItemSeparatorComponent={() => <View style={{ height: ROW_GAP }} />}
            />
          )}
        </>
      )}

      {guide.detail ? (
        <ProgrammeDialog
          channel={guide.detail.channel}
          programme={guide.detail.programme}
          onWatch={() => guide.watch(guide.detail!.channel)}
          onReplay={() => guide.replay(guide.detail!.channel, guide.detail!.programme)}
          onClose={() => guide.setDetail(null)}
        />
      ) : null}
    </View>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
      {children}
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text weight={on ? 'semibold' : 'medium'} size={14} color={on ? colors.text : colors.textSoft}>{label}</Text>
    </Pressable>
  );
}

const PROGRAMME_ROW = 64;

/** One channel's programmes on one day, scrolled to what's on now. */
function DayList({ playlist, channel, day, onOpen }: { playlist: Playlist; channel: Channel; day: number; onOpen: (p: Programme) => void }) {
  const { t } = useI18n();
  const time = useTimeFormat();
  const now = useNow(30_000);
  const programmes = useChannelProgrammes(playlist, channel.epgId, day, addDays(day, 1));
  const current = useMemo(() => Math.max(0, programmes?.findIndex((p) => p.end > now) ?? 0), [programmes, now]);

  if (!programmes) return <Text size={14} color={colors.textMuted} style={styles.empty}>{t('guide.loading')}</Text>;
  if (programmes.length === 0) return <Text size={14} color={colors.textMuted} style={styles.empty}>{t('guide.dayEmpty')}</Text>;
  return (
    <FlatList
      key={`${channel.id}|${day}`}
      data={programmes}
      keyExtractor={(p) => String(p.start)}
      contentContainerStyle={styles.list}
      initialScrollIndex={current}
      getItemLayout={(_, index) => ({ length: PROGRAMME_ROW, offset: PROGRAMME_ROW * index, index })}
      renderItem={({ item }) => {
        const live = item.start <= now && now < item.end;
        const past = item.end <= now;
        const replay = canReplay(channel, item, now);
        return (
          <Pressable onPress={() => onOpen(item)} accessibilityLabel={item.title} style={[styles.programme, live && styles.programmeLive]}>
            <Text size={14} weight="semibold" color={live ? colors.accentLight : past ? colors.textFaint : colors.textSoft} style={styles.time}>
              {time(item.start)}
            </Text>
            <Text size={15} weight={live ? 'semibold' : 'regular'} numberOfLines={2} color={past ? colors.textMuted : colors.text} style={styles.flex}>
              {item.title}
            </Text>
            {replay ? <Icon name="archive" size={16} color={colors.accentLight} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  title: { flex: 1, letterSpacing: -1 },
  status: { paddingHorizontal: 20, paddingTop: 4, lineHeight: 17 },
  chipsScroll: { flexGrow: 0, flexShrink: 0, marginTop: 12 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: { height: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.glassStrong },
  chipOn: { backgroundColor: colors.accent },
  empty: { paddingHorizontal: 20, paddingTop: 16, lineHeight: 20 },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  programme: { height: PROGRAMME_ROW - 6, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.glass },
  programmeLive: { backgroundColor: colors.accentSoft },
  time: { width: 64 },
});
