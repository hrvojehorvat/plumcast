import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, type ScrollView, StyleSheet, View } from 'react-native';
import { SpatialNavigationScrollView, SpatialNavigationView, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { aroundNow, type Programme } from '../core/epg';
import { useArchive } from '../data/catchup';
import { useNow, useProgrammes } from '../data/epg';
import type { Channel } from '../data/live';
import type { Playlist } from '../data/playlists';
import { Video } from '../player/Video';
import { Focusable } from '../ui/Focusable';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { setBackStep } from '../ui/lastKey';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useTimeFormat } from '../ui/useTimeFormat';
import { ChannelLogo } from './ChannelRow';
import { useDebounced, useStreamUrl } from './useLive';

const NOTICE_MS = 2500;
/** Programmes shown before and after the one on now. */
const AROUND = 4;
const ROW_GAP = 3;

type Row = { kind: 'before'; programme: Programme; replay: boolean } | { kind: 'now'; programme: Programme } | { kind: 'after'; programme: Programme };

/**
 * Right-hand pane: the channel picked with OK plays small (otherwise the focused one is shown, not
 * played), with four programmes before and after the one on now (the list scrolls). ▶ from the channel list comes in here:
 * OK on the picture plays it / goes full screen, OK on what's on now watches live, OK on an earlier
 * programme replays it when the channel's catch-up has it.
 * `playing` is false while the full-screen player is open (one stream at a time).
 */
export function PreviewPane({
  playlist,
  channel,
  playing,
  onChoose,
  onWatchLive,
  onReplay,
  onBack,
}: {
  playlist: Playlist;
  channel: Channel | null;
  playing: boolean;
  /** OK on the picture: play it here, or full screen when it already plays. */
  onChoose: (channel: Channel) => void;
  onWatchLive: (channel: Channel) => void;
  onReplay: (channel: Channel, programme: Programme) => void;
  /** Back while in the pane: to the channel list. */
  onBack: () => void;
}) {
  const { t } = useI18n();
  const formatTime = useTimeFormat();
  const url = useStreamUrl(playlist, playing ? channel : null);
  const now = useNow(30_000);
  const guide = useProgrammes(playlist, channel?.id ?? null);
  // The catch-up list is a bigger request: only for a channel the focus rests on.
  const settled = useDebounced(channel, 700);
  const archive = useArchive(playlist, settled && settled.id === channel?.id ? settled : null);
  const strip = aroundNow(guide ?? [], archive ?? [], now, AROUND);
  const rows: Row[] = [
    ...strip.before.map((b) => ({ kind: 'before' as const, ...b })),
    ...(strip.current ? [{ kind: 'now' as const, programme: strip.current }] : []),
    ...strip.after.map((programme) => ({ kind: 'after' as const, programme })),
  ];

  const [state, setState] = useState<{ url: string | null; status: 'loading' | 'playing' | 'failed' }>({ url: null, status: 'loading' });
  const status = state.url === url ? state.status : 'loading';
  // Which programme the focus is on (its description shows below), and a short message; both per channel.
  const [focusedRow, setFocusedRow] = useState<{ channel: string; start: number } | null>(null);
  const [notice, setNotice] = useState<{ channel: string; text: string } | null>(null);
  const say = (text: string) => {
    if (!channel) return;
    const shown = { channel: channel.id, text };
    setNotice(shown);
    setTimeout(() => setNotice((n) => (n === shown ? null : n)), NOTICE_MS);
  };
  const focusedStart = focusedRow && focusedRow.channel === channel?.id ? focusedRow.start : null;
  const described = rows.find((r) => r.programme.start === focusedStart)?.programme ?? strip.current;
  const message = notice && notice.channel === channel?.id ? notice.text : null;

  // ▼ from the picture lands on what's on now, not on the oldest programme above it.
  const nowRef = useRef<SpatialNavigationNodeRef>(null);
  const fromPicture = useRef(false);
  // The list starts scrolled to what's on now, with one earlier programme above it.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const rowHeights = useRef<number[]>([]);
  const nowIndex = rows.findIndex((row) => row.kind === 'now');
  const showNow = () =>
    setTimeout(() => {
      const above = rowHeights.current.slice(0, Math.max(0, nowIndex - 1));
      scroll.current?.scrollTo({ y: above.reduce((sum, h) => sum + (h ?? 0) + ROW_GAP, 0), animated: false });
    }, 0);

  const run = (row: Row) => {
    if (!channel) return;
    if (row.kind === 'now') onWatchLive(channel);
    else if (row.kind === 'before') {
      if (row.replay) onReplay(channel, row.programme);
      else say(t('live.noReplay'));
    } else say(t('live.startsAt', { time: formatTime(row.programme.start) }));
  };

  return (
    <SpatialNavigationView direction="vertical" style={styles.pane}>
      <Focusable
        accessibilityLabel={channel?.name ?? t('nav.live')}
        onSelect={() => channel && onChoose(channel)}
        onFocus={() => {
          fromPicture.current = false;
          setBackStep(onBack);
        }}
        onBlur={() => (fromPicture.current = true)}
      >
        {({ isFocused }) => (
          <View style={[styles.video, isFocused && styles.videoFocused]}>
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
                  <Icon name="play" size={24} color={isFocused ? colors.text : colors.textFaint} />
                )}
              </View>
            ) : null}
          </View>
        )}
      </Focusable>

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

          {rows.length ? (
            // The remote moves through items in the order they registered, not the order on screen. Earlier
            // programmes arrive later (with the catch-up list), so the list mounts anew whenever its rows change.
            // (The library types the scroll view's ref as the component itself; it is the instance.)
            <SpatialNavigationScrollView ref={scroll as never} offsetFromStart={70} style={styles.rowsScroll}>
              <SpatialNavigationView key={rows.map((row) => `${row.kind}|${row.programme.start}`).join(',')} direction="vertical" style={styles.rows}>
                {rows.map((row, index) => {
                  const p = row.programme;
                  const isNow = row.kind === 'now';
                  const dim = row.kind === 'before' && !row.replay;
                  return (
                    <Focusable
                      key={`${row.kind}|${p.start}`}
                      accessibilityLabel={`${formatTime(p.start)} ${p.title}`}
                      focusRef={isNow ? nowRef : undefined}
                      onSelect={() => run(row)}
                      onFocus={() => {
                        if (fromPicture.current) {
                          fromPicture.current = false;
                          if (!isNow && nowRef.current) {
                            nowRef.current.focus();
                            return;
                          }
                        }
                        setBackStep(onBack);
                        setFocusedRow({ channel: channel.id, start: p.start });
                      }}
                    >
                      {({ isFocused }) => (
                        <View
                          style={[styles.row, isNow && styles.rowNow, isFocused && styles.rowFocused]}
                          onLayout={(e) => {
                            rowHeights.current[index] = e.nativeEvent.layout.height;
                            if (isNow) showNow();
                          }}
                        >
                          <View style={styles.rowLine}>
                            <Text size={12} weight={isNow ? 'semibold' : 'medium'} color={isNow ? colors.accentLight : dim ? colors.textFaint : colors.textMuted} style={styles.time}>
                              {formatTime(p.start)}
                            </Text>
                            <Text size={13} weight={isNow ? 'semibold' : undefined} numberOfLines={1} color={dim ? colors.textFaint : isNow ? colors.text : colors.textSoft} style={styles.flex}>
                              {p.title}
                            </Text>
                            {isNow ? (
                              <View style={styles.liveBadge}>
                                <Text weight="semibold" size={9} color="#ffffff">{t('live.liveBadge')}</Text>
                              </View>
                            ) : row.kind === 'before' && row.replay ? (
                              <Icon name="archive" size={14} color={isFocused ? colors.text : colors.accentLight} />
                            ) : null}
                          </View>
                          {isNow ? (
                            <View style={styles.track}>
                              <View style={[styles.fill, { width: `${Math.round(Math.max(0, Math.min(1, (now - p.start) / (p.end - p.start))) * 100)}%` }]} />
                            </View>
                          ) : null}
                        </View>
                      )}
                    </Focusable>
                  );
                })}
              </SpatialNavigationView>
            </SpatialNavigationScrollView>
          ) : (
            <Text size={12} color={colors.textMuted}>{t('live.noGuide')}</Text>
          )}

          {described?.description ? (
            <Text size={12} color={colors.textSoft} numberOfLines={2} style={styles.desc}>{described.description}</Text>
          ) : null}
          <Text size={11} color={message ? colors.accentLight : colors.textFaint} weight={message ? 'semibold' : undefined}>
            {message ?? t(playing ? 'live.previewHint' : 'live.previewStart')}
          </Text>
        </View>
      ) : null}
    </SpatialNavigationView>
  );
}

const styles = StyleSheet.create({
  pane: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 170, gap: 10, paddingTop: 2 },
  flex: { flex: 1 },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', borderWidth: 2, borderColor: colors.border },
  videoFocused: { borderColor: colors.focusRing },
  videoCover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  centerText: { textAlign: 'center' },
  info: { flex: 1, minHeight: 0, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowsScroll: { flexGrow: 0, flexShrink: 1 },
  rows: { gap: ROW_GAP },
  row: { paddingHorizontal: 10, paddingVertical: 6, gap: 5, borderRadius: radius.sm, borderWidth: 2, borderColor: 'transparent' },
  rowNow: { backgroundColor: colors.glassStrong },
  rowFocused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { minWidth: 40, fontVariant: ['tabular-nums'] },
  liveBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.live },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.glass, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.accent },
  desc: { lineHeight: 16 },
});
