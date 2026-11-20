import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationScrollView, SpatialNavigationVirtualizedList, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { replayDays } from '../core/catchup';
import type { Programme } from '../core/epg';
import { formatDay } from '../core/format';
import { addDays, dayStart } from '../core/guide';
import { useArchive } from '../data/catchup';
import { useNow } from '../data/epg';
import type { AiredItem, Channel } from '../data/live';
import type { Playlist } from '../data/playlists';
import { ChannelLogo } from '../live/ChannelRow';
import { livePlayer } from '../player/store';
import { Focusable } from '../ui/Focusable';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useTimeFormat } from '../ui/useTimeFormat';
import { dayLabel, useArchiveDays } from './useCatchup';

const ITEM = 52;

/** Replays of one channel: day chips, then that day's programmes, newest first. */
export function ArchivePane({
  playlist,
  channel,
  list,
  wide,
  autoFocus = false,
  onFocusIn,
}: {
  playlist: Playlist;
  channel: Channel;
  list: Channel[] | null;
  wide: boolean;
  /** Move the remote focus to the newest programme once it is loaded (a page of its own). */
  autoFocus?: boolean;
  /** The remote moved somewhere into the pane. */
  onFocusIn?: () => void;
}) {
  const { t, lang } = useI18n();
  const now = useNow(60_000);
  const programmes = useArchive(playlist, channel);
  const days = useArchiveDays(programmes);
  const [chosen, setChosen] = useState<number | null>(null);
  const day = chosen !== null && days.includes(chosen) ? chosen : (days[0] ?? null);
  const shown = programmes && day !== null ? programmes.filter((p) => dayStart(p.start) === day) : [];
  const today = dayStart(now);
  const play = (programme: Programme) => livePlayer.openReplay(playlist.id, list ?? [channel], channel, programme);
  const label = (d: number) => dayLabel(d, today, t, (ms) => formatDay(ms, lang));

  const empty =
    programmes === undefined ? t('catchup.loading') : programmes.length === 0 ? t('catchup.noArchive', { days: replayDays(channel) }) : null;

  if (!wide) {
    return (
      <View style={styles.flex}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.phoneChips}>
          {days.map((d) => (
            <Pressable key={d} onPress={() => setChosen(d)} style={[styles.chip, d === day && styles.chipOn]}>
              <Text weight={d === day ? 'semibold' : 'medium'} size={14} color={d === day ? '#ffffff' : colors.textSoft}>{label(d)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {empty ? (
          <Text size={14} color={colors.textMuted} style={styles.phoneEmpty}>{empty}</Text>
        ) : (
          <FlatList
            key={`${channel.id}|${day}`}
            data={shown}
            keyExtractor={(p) => String(p.start)}
            contentContainerStyle={styles.phoneList}
            getItemLayout={(_, index) => ({ length: ITEM, offset: ITEM * index, index })}
            renderItem={({ item }) => (
              <Pressable onPress={() => play(item)} accessibilityLabel={item.title}>
                <ProgrammeRow programme={item} focused={false} />
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <WideArchive
      days={days}
      day={day}
      label={label}
      onDay={setChosen}
      shown={shown}
      empty={empty}
      channelKey={channel.id}
      onPlay={play}
      autoFocus={autoFocus}
      onEnter={() => onFocusIn?.()}
    />
  );
}

function WideArchive({
  days,
  day,
  label,
  onDay,
  shown,
  empty,
  channelKey,
  onPlay,
  autoFocus,
  onEnter,
}: {
  days: number[];
  day: number | null;
  label: (d: number) => string;
  onDay: (d: number) => void;
  shown: Programme[];
  empty: string | null;
  channelKey: string;
  onPlay: (p: Programme) => void;
  autoFocus: boolean;
  onEnter: () => void;
}) {
  const [width, setWidth] = useState(0);
  const first = useRef<SpatialNavigationNodeRef>(null);
  const dayChip = useRef<SpatialNavigationNodeRef>(null);
  /** The last focus was a programme (so a chip focus now is ▲ from the list). */
  const fromList = useRef(false);
  /** The remote is somewhere in this pane (false after it leaves). */
  const inside = useRef(false);
  /** The loading / empty line held the focus; hand it to the newest programme once they're in. */
  const waiting = useRef(autoFocus);
  const ready = width > 0 && shown.length > 0;
  useEffect(() => {
    if (!ready || !waiting.current) return;
    waiting.current = false;
    const id = setTimeout(() => first.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [ready]);
  const enter = () => {
    inside.current = true;
    onEnter();
  };
  /**
   * Coming in from the channel list (▶) lands on the newest programme, not the day chips:
   * the chips are one ▲ away from the list.
   */
  const onChipFocus = (d: number) => {
    const wasList = fromList.current;
    fromList.current = false;
    if (!inside.current && first.current) {
      enter();
      setTimeout(() => first.current?.focus(), 0);
      return;
    }
    // ▲ from the list goes to the day being shown, not whichever chip is nearest.
    if (wasList && d !== day && dayChip.current) {
      setTimeout(() => dayChip.current?.focus(), 0);
      return;
    }
    enter();
  };
  return (
    <SpatialNavigationNode orientation="vertical" onInactive={() => (inside.current = false)}>
      <View style={styles.wide}>
      {days.length > 0 ? (
        // The horizontal scroll view fills its parent, so this box sets the row's height.
        <View style={styles.chipsRow}>
          <SpatialNavigationScrollView horizontal offsetFromStart={40}>
            {/* A row of its own: ◀/▶ change the day, ▼ goes to the programmes. */}
            <SpatialNavigationNode orientation="horizontal">
            <View style={styles.chips}>
              {days.map((d) => (
                <Focusable key={d} focusRef={d === day ? dayChip : undefined} accessibilityLabel={label(d)} onSelect={() => onDay(d)} onFocus={() => onChipFocus(d)}>
                  {({ isFocused }) => (
                    <View style={[styles.chip, d === day && styles.chipOn, isFocused && styles.focused]}>
                      <Text size={12} weight={d === day ? 'semibold' : 'medium'} color={d === day ? '#ffffff' : colors.textSoft}>{label(d)}</Text>
                    </View>
                  )}
                </Focusable>
              ))}
            </View>
            </SpatialNavigationNode>
          </SpatialNavigationScrollView>
        </View>
      ) : null}
      <View style={styles.listFill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {empty ? (
          // Focusable, so ▶ from the channel list always has somewhere to go, even while loading.
          <Focusable
            accessibilityLabel={empty}
            onFocus={() => {
              enter();
              fromList.current = false;
              waiting.current = true;
            }}
            // Leaving it cancels the hand-over, but a moment later: when the programmes arrive this
            // line disappears (a blur too) and the hand-over below must still happen.
            onBlur={() => setTimeout(() => (waiting.current = false), 0)}
          >
            {({ isFocused }) => (
              <View style={[styles.emptyBox, isFocused && styles.emptyFocused]}>
                <Text size={14} color={colors.textMuted} style={styles.empty}>{empty}</Text>
              </View>
            )}
          </Focusable>
        ) : width > 0 ? (
          <SpatialNavigationVirtualizedList
            key={`${channelKey}|${day}`}
            data={shown}
            itemSize={ITEM}
            orientation="vertical"
            scrollBehavior="stick-to-start"
            additionalItemsRendered={4}
            renderItem={({ item, index }: { item: Programme; index: number }) => (
              <Focusable focusRef={index === 0 ? first : undefined} accessibilityLabel={item.title} onFocus={() => { enter(); fromList.current = true; }} onSelect={() => onPlay(item)} style={{ width }}>
                {({ isFocused }) => <ProgrammeRow programme={item} focused={isFocused} />}
              </Focusable>
            )}
          />
        ) : null}
      </View>
      </View>
    </SpatialNavigationNode>
  );
}

function ProgrammeRow({ programme, focused }: { programme: Programme; focused: boolean }) {
  const { t } = useI18n();
  const time = useTimeFormat();
  const minutes = Math.round((programme.end - programme.start) / 60_000);
  return (
    <View style={[styles.row, focused && styles.rowFocused]}>
      <View style={styles.time}>
        <Text size={13} weight="semibold" color={focused ? colors.accentLight : colors.text}>{time(programme.start)}</Text>
        <Text size={10} color={colors.textFaint}>{t('guide.minutes', { n: minutes })}</Text>
      </View>
      <View style={styles.flex}>
        <Text size={13} weight="medium" numberOfLines={1}>{programme.title}</Text>
        {programme.description ? (
          <Text size={11} color={colors.textMuted} numberOfLines={1}>{programme.description}</Text>
        ) : null}
      </View>
      <Icon name={focused ? 'play' : 'archive'} size={16} color={focused ? colors.accentLight : colors.textFaint} />
    </View>
  );
}

// ---------------------------------------------------------------- recently aired

/** Programmes that just ended on catch-up channels, newest first, across channels. */
export function AiredList({ playlist, items, wide, onFocusIn }: { playlist: Playlist; items: AiredItem[] | undefined; wide: boolean; onFocusIn?: () => void }) {
  const { t } = useI18n();
  const [width, setWidth] = useState(0);
  const play = (item: AiredItem) => livePlayer.openReplay(playlist.id, [item.channel], item.channel, item.programme);

  if (items === undefined) return <Text size={14} color={colors.textMuted} style={wide ? styles.empty : styles.phoneEmpty}>{t('catchup.loading')}</Text>;
  if (items.length === 0) return <Text size={14} color={colors.textMuted} style={wide ? styles.empty : styles.phoneEmpty}>{t('catchup.noRecent')}</Text>;

  if (!wide) {
    return (
      <FlatList
        data={items}
        keyExtractor={(i) => `${i.channel.id}|${i.programme.start}`}
        contentContainerStyle={styles.phoneList}
        getItemLayout={(_, index) => ({ length: ITEM, offset: ITEM * index, index })}
        renderItem={({ item }) => (
          <Pressable onPress={() => play(item)} accessibilityLabel={item.programme.title}>
            <AiredRow item={item} focused={false} />
          </Pressable>
        )}
      />
    );
  }
  return (
    <View style={styles.listFill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <SpatialNavigationVirtualizedList
          data={items}
          itemSize={ITEM}
          orientation="vertical"
          scrollBehavior="stick-to-start"
          additionalItemsRendered={4}
          renderItem={({ item }: { item: AiredItem }) => (
            <Focusable accessibilityLabel={item.programme.title} onFocus={onFocusIn} onSelect={() => play(item)} style={{ width }}>
              {({ isFocused }) => <AiredRow item={item} focused={isFocused} />}
            </Focusable>
          )}
        />
      ) : null}
    </View>
  );
}

function AiredRow({ item, focused }: { item: AiredItem; focused: boolean }) {
  const { t, lang } = useI18n();
  const time = useTimeFormat();
  const now = useNow(60_000);
  const today = dayStart(now);
  const day = dayStart(item.programme.start);
  const when = day === today ? '' : `${day === addDays(today, -1) ? t('catchup.yesterday') : formatDay(day, lang)} · `;
  return (
    <View style={[styles.row, focused && styles.rowFocused]}>
      <ChannelLogo channel={item.channel} />
      <View style={styles.flex}>
        <Text size={13} weight="medium" numberOfLines={1}>{item.programme.title}</Text>
        <Text size={11} color={colors.textMuted} numberOfLines={1}>
          {item.channel.name} · {when}{time(item.programme.start)}–{time(item.programme.end)}
        </Text>
      </View>
      <Icon name={focused ? 'play' : 'archive'} size={16} color={focused ? colors.accentLight : colors.textFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wide: { flex: 1, gap: 8 },
  chipsRow: { flexGrow: 0, flexShrink: 0, height: 38 },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  chip: {
    height: 30,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.glassStrong,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: colors.accent },
  focused: { borderColor: colors.focusRing },
  listFill: { flex: 1, minHeight: 0, overflow: 'hidden' },
  empty: { lineHeight: 20, maxWidth: 420 },
  emptyBox: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  emptyFocused: { borderColor: colors.focusRing },
  row: {
    height: ITEM - 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowFocused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  time: { width: 48 },
  chipsScroll: { flexGrow: 0, flexShrink: 0, marginTop: 4 },
  phoneChips: { gap: 8, paddingHorizontal: 20 },
  phoneEmpty: { paddingHorizontal: 20, paddingTop: 16, lineHeight: 20 },
  phoneList: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 0 },
});
