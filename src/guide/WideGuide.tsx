import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SpatialNavigationView, SpatialNavigationVirtualizedList, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { canReplay } from '../core/catchup';
import type { Programme } from '../core/epg';
import { formatDay } from '../core/format';
import { addDays, layoutRow, type GuideCell } from '../core/guide';
import { cancelGuideSync, syncGuide } from '../data/guide';
import { useNow } from '../data/epg';
import type { Channel } from '../data/live';
import type { Playlist } from '../data/playlists';
import { ChannelLogo } from '../live/ChannelRow';
import { Button } from '../ui/Button';
import { Focusable } from '../ui/Focusable';
import { Icon } from '../ui/Icon';
import { useI18n } from '../ui/i18n';
import { PickerDialog } from '../ui/PickerDialog';
import { Row } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useTimeFormat } from '../ui/useTimeFormat';
import { ProgrammeDialog } from './ProgrammeDialog';
import { useChannelProgrammes } from './useGuide';
import { useGuideScreen, useGuideStatusLine } from './useGuideScreen';

const ROW = 64;
const ROW_GAP = 6;
const CHANNEL_W = 210;
const GAP = 6;
/** About this many minutes fit on screen. */
const VISIBLE_MIN = 150;
const HALF_HOUR = 30 * 60_000;

const floorHalfHour = (ms: number) => Math.floor(ms / HALF_HOUR) * HALF_HOUR;

/** The TV / desktop guide: channels down, time across, remote focus moves through programmes. */
export function WideGuide({ playlist }: { playlist: Playlist }) {
  const { t, lang } = useI18n();
  const guide = useGuideScreen(playlist);
  const line = useGuideStatusLine(playlist);
  const now = useNow(30_000);
  const [gridWidth, setGridWidth] = useState(0);
  const [picking, setPicking] = useState(false);

  const trackWidth = Math.max(0, gridWidth - CHANNEL_W - GAP);
  const pxPerMin = Math.max(3, trackWidth / VISIBLE_MIN);
  const visibleMs = (trackWidth / pxPerMin) * 60_000;
  const dayEnd = addDays(guide.day, 1);

  const clamp = useCallback((ms: number) => Math.max(guide.day, Math.min(dayEnd - visibleMs, ms)), [guide.day, dayEnd, visibleMs]);
  const initialView = guide.day === guide.today ? floorHalfHour(now) - HALF_HOUR : guide.day + 18 * 3_600_000;
  // The visible window's start, per day (a new day starts at its default).
  const [view, setView] = useState<{ day: number; start: number } | null>(null);
  const viewStart = clamp(view?.day === guide.day ? view.start : initialView);

  // Keep the focused programme on screen.
  const onFocusCell = useCallback(
    (cell: GuideCell) => {
      setView((current) => {
        const start = clamp(current?.day === guide.day ? current.start : initialView);
        // Long programmes and empty stretches that still show on screen don't move the view.
        const offLeft = cell.end <= start + 10 * 60_000;
        const offRight = cell.start >= start + visibleMs - 20 * 60_000;
        if (!offLeft && !offRight) return current;
        // Moving back: show the end of the cell; moving forward: start at it.
        const target = offLeft ? Math.max(cell.start, cell.end - visibleMs / 2) : cell.start;
        return { day: guide.day, start: clamp(floorHalfHour(target)) };
      });
    },
    [clamp, guide.day, initialView, visibleMs],
  );

  const openCell = useCallback((channel: Channel, programme: Programme | null) => {
    if (programme) guide.setDetail({ channel, programme });
    else guide.watch(channel);
  }, [guide]);

  const nowX = guide.day === guide.today ? ((now - viewStart) / 60_000) * pxPerMin : -1;

  return (
    <SpatialNavigationView direction="vertical" style={styles.root}>
      <View style={styles.head}>
        <Text weight="bold" size={30} style={styles.title}>{t('nav.guide')}</Text>
        <Text size={13} color={line.problem ? '#ffc9c9' : colors.textFaint} numberOfLines={2} style={styles.status}>{line.text}</Text>
        <Row>
          {line.busy ? (
            <Button icon="stop" label={t('sync.stop')} onPress={cancelGuideSync} />
          ) : (
            <Button icon="refresh" label={t('guide.update')} onPress={() => void syncGuide(playlist)} />
          )}
        </Row>
      </View>

      <Row style={styles.filters}>
        <Button icon="down" label={guide.category?.name ?? t('live.categories')} onPress={() => setPicking(true)} />
        {guide.days.map((d) => (
          <DayChip key={d} label={d === guide.today ? t('guide.today') : formatDay(d, lang)} selected={d === guide.day} onSelect={() => guide.setDay(d)} />
        ))}
      </Row>

      <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {gridWidth > 0 ? (
          <>
            <Ruler viewStart={viewStart} visibleMs={visibleMs} pxPerMin={pxPerMin} />
            <View style={styles.rows}>
              {guide.channels === null ? (
                <Text size={14} color={colors.textMuted}>{t('live.loading')}</Text>
              ) : guide.channels.length === 0 ? (
                <Text size={14} color={colors.textMuted}>{t('live.noChannels')}</Text>
              ) : (
                <SpatialNavigationVirtualizedList
                  key={guide.selected ?? ''}
                  data={guide.channels}
                  itemSize={ROW + ROW_GAP}
                  orientation="vertical"
                  isGrid
                  scrollBehavior="stick-to-start"
                  additionalItemsRendered={3}
                  renderItem={({ item }: { item: Channel }) => (
                    <GuideRow
                      playlist={playlist}
                      channel={item}
                      day={guide.day}
                      dayEnd={dayEnd}
                      viewStart={viewStart}
                      pxPerMin={pxPerMin}
                      width={gridWidth}
                      trackWidth={trackWidth}
                      now={now}
                      onFocusCell={onFocusCell}
                      onOpen={openCell}
                      onWatch={guide.watch}
                    />
                  )}
                />
              )}
              {nowX >= 0 && nowX <= trackWidth ? <View pointerEvents="none" style={[styles.nowLine, { left: CHANNEL_W + GAP + nowX }]} /> : null}
            </View>
          </>
        ) : null}
      </View>

      {picking && guide.categories ? (
        <PickerDialog
          title={t('live.categories')}
          options={guide.categories.map((c) => ({ id: c.id, label: c.name, detail: c.count !== null ? String(c.count) : undefined }))}
          value={guide.selected}
          onPick={(id) => {
            guide.selectCategory(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
      {guide.detail ? (
        <ProgrammeDialog
          channel={guide.detail.channel}
          programme={guide.detail.programme}
          onWatch={() => guide.watch(guide.detail!.channel)}
          onReplay={() => guide.replay(guide.detail!.channel, guide.detail!.programme)}
          onClose={() => guide.setDetail(null)}
        />
      ) : null}
    </SpatialNavigationView>
  );
}

function DayChip({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <Focusable accessibilityLabel={label} onSelect={onSelect}>
      {({ isFocused }) => (
        <View style={[styles.chip, selected && styles.chipOn, isFocused && styles.focused]}>
          <Text size={14} weight={selected ? 'semibold' : 'medium'} color={selected ? '#ffffff' : colors.textSoft}>{label}</Text>
        </View>
      )}
    </Focusable>
  );
}

/** Half-hour marks above the grid. */
function Ruler({ viewStart, visibleMs, pxPerMin }: { viewStart: number; visibleMs: number; pxPerMin: number }) {
  const time = useTimeFormat();
  const marks: number[] = [];
  for (let m = floorHalfHour(viewStart); m < viewStart + visibleMs; m += HALF_HOUR) if (m >= viewStart) marks.push(m);
  return (
    <View style={styles.ruler}>
      {marks.map((m) => (
        <Text key={m} size={12} weight="medium" color={colors.textMuted} style={[styles.mark, { left: CHANNEL_W + GAP + ((m - viewStart) / 60_000) * pxPerMin }]}>
          {time(m)}
        </Text>
      ))}
    </View>
  );
}

interface RowProps {
  playlist: Playlist;
  channel: Channel;
  day: number;
  dayEnd: number;
  viewStart: number;
  pxPerMin: number;
  width: number;
  trackWidth: number;
  now: number;
  onFocusCell: (cell: GuideCell) => void;
  onOpen: (channel: Channel, programme: Programme | null) => void;
  onWatch: (channel: Channel) => void;
}

/**
 * One channel: its name (OK = watch live), then the day's programmes. Every 5-minute slot of
 * the day belongs to exactly one cell, so moving up/down lands on the programme at that time.
 */
const GuideRow = memo(function GuideRow({ playlist, channel, day, dayEnd, viewStart, pxPerMin, width, trackWidth, now, onFocusCell, onOpen, onWatch }: RowProps) {
  const { t } = useI18n();
  const programmes = useChannelProgrammes(playlist, channel.epgId, day, dayEnd);
  const cells = useMemo(() => layoutRow(programmes ?? [], day, dayEnd), [programmes, day, dayEnd]);
  // All cells re-register together when the layout changes, which keeps their order for the remote.
  const layoutKey = `${day}|${programmes ? cells.length : 'loading'}|${cells[0]?.slots[1] ?? 0}|${cells.at(-1)?.slots[0] ?? 0}`;
  // Right from the channel name lands on the day's first cell; send it on to what's on screen.
  const fromChannel = useRef(false);
  const refs = useRef(new Map<number, SpatialNavigationNodeRef | null>());
  const onFocus = (cell: GuideCell) => {
    if (fromChannel.current) {
      fromChannel.current = false;
      const target = cells.find((c) => c.end > viewStart + 5 * 60_000) ?? cell;
      if (target !== cell) {
        // After the library has finished its own move.
        const node = refs.current.get(target.slots[0]);
        setTimeout(() => node?.focus(), 0);
        return;
      }
    }
    onFocusCell(cell);
  };

  return (
    <View style={[styles.row, { width }]}>
      <Focusable
        accessibilityLabel={channel.name}
        indexRange={[0, 0]}
        onFocus={() => (fromChannel.current = true)}
        // Focus that moves on to another row's channel must not count later.
        onBlur={() => setTimeout(() => (fromChannel.current = false), 0)}
        onSelect={() => onWatch(channel)}
        style={styles.channelCell}
      >
        {({ isFocused }) => (
          <View style={[styles.channel, isFocused && styles.focused]}>
            <ChannelLogo channel={channel} width={48} height={34} />
            <View style={styles.flex}>
              {channel.num !== null ? <Text size={11} color={colors.textFaint}>{channel.num}</Text> : null}
              <Text size={14} weight="semibold" numberOfLines={1}>{channel.name}</Text>
            </View>
          </View>
        )}
      </Focusable>
      <View style={[styles.track, { width: trackWidth }]}>
        <View key={layoutKey} style={StyleSheet.absoluteFill}>
          {cells.map((cell) => (
            <ProgrammeCell
              key={cell.slots[0]}
              focusRef={(node) => {
                refs.current.set(cell.slots[0], node);
              }}
              cell={cell}
              viewStart={viewStart}
              pxPerMin={pxPerMin}
              now={now}
              replay={cell.programme !== null && canReplay(channel, cell.programme, now)}
              emptyLabel={programmes ? t('live.noGuide') : ''}
              onFocus={() => onFocus(cell)}
              onSelect={() => onOpen(channel, cell.programme)}
            />
          ))}
        </View>
      </View>
    </View>
  );
});

function ProgrammeCell({ focusRef, cell, viewStart, pxPerMin, now, replay, emptyLabel, onFocus, onSelect }: {
  focusRef: (node: SpatialNavigationNodeRef | null) => void;
  cell: GuideCell;
  viewStart: number;
  pxPerMin: number;
  now: number;
  /** Past, and in the channel's archive. */
  replay: boolean;
  emptyLabel: string;
  onFocus: () => void;
  onSelect: () => void;
}) {
  const time = useTimeFormat();
  const left = ((cell.start - viewStart) / 60_000) * pxPerMin;
  const width = Math.max(4, ((cell.end - cell.start) / 60_000) * pxPerMin - 4);
  // Long programmes that started off screen keep their title readable at the left edge.
  const inset = Math.max(0, Math.min(width - 60, -left));
  const live = cell.programme !== null && cell.start <= now && now < cell.end;
  // An empty stretch says so once: on its first piece, or on the piece at the left edge.
  const label = cell.programme?.title ?? (!cell.more || (left <= 0 && left + width > 0) ? emptyLabel : '');
  const past = cell.end <= now;
  return (
    <Focusable
      focusRef={focusRef}
      accessibilityLabel={cell.programme?.title ?? emptyLabel}
      indexRange={cell.slots}
      onFocus={onFocus}
      onSelect={onSelect}
      style={{ position: 'absolute', top: 0, bottom: 0, left, width }}
    >
      {({ isFocused }) => (
        <View style={[styles.cell, cell.programme ? (live ? styles.cellLive : styles.cellProgramme) : styles.cellEmpty, isFocused && styles.cellFocused]}>
          <View style={{ paddingLeft: inset }}>
            <Text size={14} weight={cell.programme ? 'semibold' : 'regular'} numberOfLines={1} color={isFocused ? colors.onLight : past ? colors.textMuted : colors.text}>
              {label}
            </Text>
            {cell.programme ? (
              <View style={styles.cellTime}>
                {replay ? <Icon name="archive" size={12} color={isFocused ? colors.onLight : colors.accentLight} /> : null}
                <Text size={12} numberOfLines={1} color={isFocused ? colors.onLight : colors.textFaint}>
                  {time(cell.programme.start)}–{time(cell.programme.end)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cellTime: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  root: { flex: 1, paddingHorizontal: 32, paddingTop: 28, paddingBottom: 16, gap: 14, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  title: { letterSpacing: -1 },
  status: { flex: 1, lineHeight: 18 },
  filters: { flexWrap: 'nowrap', overflow: 'hidden' },
  chip: { height: 46, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.glassStrong, borderWidth: 2, borderColor: 'transparent' },
  chipOn: { backgroundColor: colors.accent },
  focused: { borderColor: colors.focusRing },
  grid: { flex: 1, minHeight: 0 },
  ruler: { height: 24 },
  mark: { position: 'absolute', top: 2 },
  rows: { flex: 1, minHeight: 0, overflow: 'hidden' },
  row: { height: ROW, flexDirection: 'row', gap: GAP },
  channelCell: { width: CHANNEL_W, height: ROW },
  channel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glass,
  },
  track: { height: ROW, overflow: 'hidden' },
  cell: { flex: 1, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  cellProgramme: { backgroundColor: colors.glassStrong },
  cellLive: { backgroundColor: colors.accentSoft },
  cellEmpty: { backgroundColor: colors.glass },
  cellFocused: { backgroundColor: colors.text, borderColor: colors.focusRing },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.accent },
});
