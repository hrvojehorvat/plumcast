import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useLockSpatialNavigation } from 'react-tv-space-navigation';
import { formatDay } from '../core/format';
import { findReplay } from '../data/catchup';
import { useNow } from '../data/epg';
import { usePlaylists } from '../data/store';
import { useI18n } from '../ui/i18n';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';
import { useQuery } from '../ui/useQuery';
import { useTimeFormat } from '../ui/useTimeFormat';
import type { PlayerKey } from './keys';
import { ActionBar, ErrorCard, moveHighlight, playerStyles as styles, splitHighlight, type Action } from './parts';
import { clampSeek, seekStep } from './seek';
import { livePlayer, type LiveSession, type Replay } from './store';
import { usePlayerKeys } from './usePlayerKeys';
import { Video } from './Video';

const INFO_MS = 6000;
const SEEK_COMMIT_MS = 1100;
/** Quiet retries before the error shows: providers often drop the first link after a seek. */
const RETRIES = 2;
const RETRY_MS = 1500;
const TEN_MIN = 10 * 60_000;

interface Playback {
  url: string | null;
  attempt: number;
  /** Failed attempts on this link so far. */
  retries: number;
  playing: boolean;
  buffering: boolean;
  failed: boolean;
  ended: boolean;
  /** First reported position of this stream, and the latest one (seconds). */
  base: number | null;
  seconds: number;
}
const fresh = (url: string | null): Playback => ({ url, attempt: 0, retries: 0, playing: false, buffering: false, failed: false, ended: false, base: null, seconds: 0 });

/**
 * Replays a programme from the archive. A seek starts a new stream at the new time (providers
 * serve replays as streams from a start minute), so ◀/▶ collect a target first and jump once.
 */
export function ReplayPlayer({ session, replay }: { session: LiveSession; replay: Replay }) {
  const { t, lang } = useI18n();
  const time = useTimeFormat();
  const now = useNow(15_000);
  const { list } = usePlaylists();
  const playlist = list.find((p) => p.id === session.playlistId) ?? null;
  const channel = session.current;
  const { programme, from } = replay;
  const { lock, unlock } = useLockSpatialNavigation();

  // Which copy of the channel has the recording is checked before playing; the one that worked
  // is asked first again after a seek. "Try again" checks anew (round).
  const [round, setRound] = useState(0);
  const preferred = useRef<string | null>(null);
  const key = playlist ? `${playlist.id}|${playlist.syncedAt ?? 0}|${channel.id}|${from}|${programme.end}|${round}` : null;
  const found = useQuery(key, async () => {
    const result = await findReplay(playlist!, channel, from, programme.end, preferred.current);
    if (result.url) preferred.current = result.source.id;
    return result;
  });
  const url = found === undefined ? undefined : found.url;
  const source = found?.url ? found.source : null;
  const missing = found?.url === null && found.reason === 'missing';

  const [playback, setPlayback] = useState<Playback>(() => fresh(null));
  const status = playback.url === url ? playback : fresh(url ?? null);
  const update = (patch: Partial<Playback> | ((p: Playback) => Partial<Playback>)) =>
    setPlayback((p) => {
      const base = p.url === url ? p : fresh(url ?? null);
      return { ...base, ...(typeof patch === 'function' ? patch(base) : patch) };
    });
  const failed = url === null || status.failed;
  const [paused, setPaused] = useState(false);

  const position = from + (status.base === null ? 0 : Math.max(0, status.seconds - status.base) * 1000);
  const [target, setTarget] = useState<number | null>(null);
  const presses = useRef(0);
  const seekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [overlay, setOverlay] = useState(true);
  const [activity, setActivity] = useState(0);
  const [highlight, setHighlight] = useState(-1);
  const showOverlay = () => {
    setOverlay(true);
    setActivity((n) => n + 1);
  };
  // The panel stays while paused, seeking, ended or failed.
  const keepOverlay = paused || target !== null || status.ended || failed;
  useEffect(() => {
    if (!overlay || keepOverlay) return;
    const id = setTimeout(() => {
      setOverlay(false);
      setHighlight(-1);
    }, INFO_MS);
    return () => clearTimeout(id);
  }, [overlay, activity, keepOverlay]);

  useEffect(() => {
    lock();
    return () => unlock();
  }, [lock, unlock]);
  useEffect(() => () => clearTimeout(seekTimer.current), []);

  const jump = (to: number) => {
    clearTimeout(seekTimer.current);
    presses.current = 0;
    setTarget(null);
    setPaused(false);
    setHighlight(-1);
    const at = clampSeek(to, programme, Date.now());
    if (at !== from) livePlayer.seek(at);
    else update({ attempt: status.attempt + 1, retries: 0, ended: false, failed: false, base: null, seconds: 0 });
  };

  /** ◀/▶: move the target, then jump once the keys rest. */
  const nudge = (direction: 1 | -1) => {
    showOverlay();
    const step = seekStep(presses.current++);
    const next = clampSeek((target ?? position) + direction * step, programme, Date.now());
    setTarget(next);
    clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => jump(next), SEEK_COMMIT_MS);
  };

  const togglePause = () => {
    if (status.ended) jump(programme.start);
    else setPaused((p) => !p);
    showOverlay();
  };

  const onError = () => {
    // Dropped after playing a while: carry on from here (a new link) instead of the old start.
    const resumeAt = clampSeek(position, programme, Date.now());
    if (status.playing && resumeAt - from >= 60_000) {
      livePlayer.seek(resumeAt);
      return;
    }
    if (status.retries < RETRIES) {
      const retries = status.retries + 1;
      update({ playing: false, retries });
      setTimeout(() => update((p) => ({ attempt: p.attempt + 1, base: null, seconds: 0 })), RETRY_MS * retries);
    } else {
      update({ playing: false, failed: true });
      showOverlay();
    }
  };

  const actions: Action[] = [
    { key: 'pause', icon: paused || status.ended ? 'play' : 'pause', label: t(paused || status.ended ? 'player.play' : 'player.pause'), run: togglePause },
    { key: 'back', icon: 'rewind', label: t('player.back10'), run: () => jump(position - TEN_MIN) },
    { key: 'fwd', icon: 'forward', label: t('player.forward10'), run: () => jump(position + TEN_MIN) },
    { key: 'start', icon: 'catchup', label: t('player.restart'), run: () => jump(programme.start) },
    { key: 'live', icon: 'live', label: t('player.goLive'), run: livePlayer.goLive },
    { key: 'close', icon: 'close', label: t('player.close'), run: livePlayer.close },
  ];

  // Ended or failed: a card with its own buttons, first in the remote's ◀/▶ row.
  const close: Action = { key: 'close', icon: 'close', label: t('player.close'), run: livePlayer.close };
  const card: Action[] = status.ended
    ? [{ key: 'again', icon: 'catchup', label: t('player.watchAgain'), run: () => jump(programme.start) }, close]
    : failed
      ? [
          {
            key: 'retry',
            icon: 'catchup',
            label: t('player.tryAgain'),
            run: () => {
              setRound((r) => r + 1);
              jump(position);
            },
          },
          close,
        ]
      : [];
  const cardCount = status.ended || failed ? 2 : 0;
  const row = [...card, ...actions];
  const hl = splitHighlight(highlight, cardCount);
  const inRow = cardCount > 0 || (overlay && highlight !== -1);

  const onKey = (k: PlayerKey) => {
    switch (k) {
      case 'back':
        if (!cardCount && overlay && highlight !== -1) setHighlight(-1);
        else livePlayer.close();
        break;
      case 'left':
      case 'right':
        if (inRow) {
          showOverlay();
          setHighlight(moveHighlight(hl.effective, k, row.length));
        } else nudge(k === 'right' ? 1 : -1);
        break;
      case 'up':
      case 'down':
        showOverlay();
        if (cardCount) setHighlight(k === 'down' ? Math.max(hl.effective, cardCount) : Math.min(hl.effective, 0));
        else setHighlight((h) => (h === -1 ? 0 : k === 'up' ? -1 : h));
        break;
      case 'select':
        if (inRow) {
          row[hl.effective]?.run();
          showOverlay();
        } else togglePause();
        break;
      // CH+/CH− leave the replay for the next channel, live.
      case 'channelUp':
        livePlayer.step(1);
        break;
      case 'channelDown':
        livePlayer.step(-1);
        break;
      case 'info':
        showOverlay();
        break;
    }
  };
  usePlayerKeys(onKey);

  const length = programme.end - programme.start;
  const shown = target ?? position;
  const progress = Math.max(0, Math.min(1, (shown - programme.start) / length));
  const available = Math.max(0, Math.min(1, (now - programme.start) / length));

  return (
    <View style={styles.root}>
      {url && !failed && !status.ended ? (
        <Video
          key={`${url}#${status.attempt}`}
          url={url}
          live={false}
          paused={paused}
          style={StyleSheet.absoluteFill}
          onPlaying={() => update({ playing: true, buffering: false, retries: 0 })}
          onBuffering={(buffering) => update({ buffering })}
          onProgress={(seconds) => update((p) => (Math.floor(seconds) === Math.floor(p.seconds) && p.base !== null ? {} : { seconds, base: p.base ?? seconds }))}
          onEnd={() => {
            // Stopping well before the programme's end is a dropped stream (or the provider's
            // short filler clip when there is no recording), not the end.
            if (Math.min(programme.end, Date.now()) - position > 2 * 60_000) {
              onError();
              return;
            }
            update({ ended: true, playing: false });
            showOverlay();
          }}
          onError={onError}
        />
      ) : null}

      <Pressable style={StyleSheet.absoluteFill} focusable={false} accessible={false} onPress={() => (overlay ? setOverlay(false) : showOverlay())} />

      {!failed && !status.ended && !paused && (url === undefined || !status.playing || status.buffering) ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accentLight} />
        </View>
      ) : null}

      {cardCount ? (
        <ErrorCard
          title={t(status.ended ? 'player.replayEnded' : missing ? 'player.noRecording' : 'player.replayError')}
          hint={t(status.ended ? 'player.replayEndedHint' : missing ? 'player.noRecordingHint' : 'player.replayErrorHint')}
          actions={card}
          highlight={hl.card}
          onRun={(a) => a.run()}
        />
      ) : null}

      {target !== null ? (
        <View style={styles.bubble} pointerEvents="none">
          <Text weight="bold" size={32}>{time(target)}</Text>
        </View>
      ) : null}

      {overlay ? (
        <View style={styles.panel} pointerEvents="box-none">
          <View style={styles.panelInner}>
            <View style={styles.channelLine}>
              <View style={styles.badge}>
                <Text weight="semibold" size={12} color="#ffffff">{t('player.replay').toUpperCase()}</Text>
              </View>
              {channel.logo ? <Image source={{ uri: channel.logo }} style={styles.logo} resizeMode="contain" /> : null}
              <Text weight="bold" size={20} numberOfLines={1} style={styles.flex}>
                {channel.name}
                {source && source.id !== channel.id ? (
                  <Text size={13} color={colors.textMuted}>{'  ·  '}{t('player.recordingFrom', { name: source.name })}</Text>
                ) : null}
              </Text>
            </View>
            <View style={styles.programme}>
              <Text weight="semibold" size={18} numberOfLines={1}>{programme.title}</Text>
              <Text size={13} color={colors.textMuted}>
                {formatDay(programme.start, lang)} · {time(programme.start)}–{time(programme.end)}
              </Text>
              <View style={styles.timeRow}>
                <Text size={14} weight="semibold" color={target !== null ? colors.accentLight : colors.text}>{time(shown)}</Text>
                <View style={styles.track}>
                  {available < 1 ? <View style={[local.available, { width: `${Math.round(available * 100)}%` }]} /> : null}
                  <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text size={13} color={colors.textMuted}>{time(programme.end)}</Text>
              </View>
            </View>
            <ActionBar
              actions={actions}
              highlight={hl.bar}
              onRun={(a) => {
                a.run();
                showOverlay();
              }}
            />
            {(Platform.isTV || Platform.OS === 'web') && !cardCount ? <Text size={12} color={colors.textFaint}>{t('player.replayKeysHint')}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  available: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.18)' },
});
