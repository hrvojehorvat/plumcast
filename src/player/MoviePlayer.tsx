import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useLockSpatialNavigation } from 'react-tv-space-navigation';
import { formatClock, isFinished, movieSeekStep } from '../core/vod';
import { saveProgress } from '../data/movies';
import { usePlaylists } from '../data/store';
import { movieUrl, useMovieInfo } from '../data/vod';
import { useI18n } from '../ui/i18n';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';
import { useLatest, useQuery } from '../ui/useQuery';
import type { PlayerKey } from './keys';
import { ActionBar, ErrorCard, moveHighlight, playerStyles as styles, splitHighlight, type Action } from './parts';
import { moviePlayer, type MovieSession } from './store';
import { usePlayerKeys } from './usePlayerKeys';
import { Video } from './Video';

const INFO_MS = 5000;
const SEEK_COMMIT_MS = 900;
const SAVE_EVERY_MS = 10_000;
const RETRIES = 2;
const RETRY_MS = 1500;
const TEN_MIN = 10 * 60_000;

/**
 * Full-screen movie playback. Movies are files, so seeking happens inside the open stream;
 * ◀/▶ collect a target first (growing steps) and jump once the keys rest.
 */
export function MoviePlayer({ session }: { session: MovieSession }) {
  const { t } = useI18n();
  const { list } = usePlaylists();
  const playlist = list.find((p) => p.id === session.playlistId) ?? null;
  const { movie } = session;
  const info = useMovieInfo(playlist, movie.id);
  const { lock, unlock } = useLockSpatialNavigation();

  const url = useQuery(playlist ? `${playlist.id}|${movie.id}` : null, () => movieUrl(playlist!, movie));

  // Position and length in ms. The start of the current attempt is where a retry picks up.
  const [positionMs, setPositionMs] = useState(session.startMs);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const length = durationMs ?? info?.durationMs ?? movie.progress?.durationMs ?? null;
  const [attempt, setAttempt] = useState({ n: 0, fromMs: session.startMs, retries: 0 });
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seekReq, setSeekReq] = useState<{ seconds: number } | null>(null);
  const broken = url === null || failed;

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
  const keepOverlay = paused || target !== null || ended || broken || !playing;
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

  // Saves the position every few seconds, and once more (visibly) when the player closes.
  const latest = useLatest({ positionMs, length, playing, ended });
  useEffect(() => {
    if (!playlist) return;
    const save = (notify: boolean) => {
      const { positionMs: at, length: of, playing: started, ended: done } = latest.current;
      if (!started && !done) return;
      const watched = done || isFinished(at, of);
      saveProgress(playlist.id, movie.id, watched ? (of ?? at) : at, of, watched, notify).catch((error: unknown) =>
        console.warn('[movies] could not save the position', error instanceof Error ? error.message : error),
      );
    };
    const id = setInterval(() => save(false), SAVE_EVERY_MS);
    return () => {
      clearInterval(id);
      save(true);
    };
  }, [playlist, movie.id, latest]);
  useEffect(() => () => clearTimeout(seekTimer.current), []);

  const restartAt = (ms: number) => {
    setFailed(false);
    setEnded(false);
    setPlaying(false);
    setPaused(false);
    setPositionMs(ms);
    setAttempt((a) => ({ n: a.n + 1, fromMs: ms, retries: 0 }));
  };

  const clampTarget = (ms: number) => Math.max(0, length ? Math.min(ms, length - 5_000) : ms);

  const jump = (to: number) => {
    clearTimeout(seekTimer.current);
    presses.current = 0;
    setTarget(null);
    setHighlight(-1);
    const at = clampTarget(to);
    if (ended || broken) return restartAt(at);
    setPositionMs(at);
    setSeekReq({ seconds: at / 1000 });
    setPaused(false);
  };

  const nudge = (direction: 1 | -1) => {
    showOverlay();
    const step = movieSeekStep(presses.current++);
    const next = clampTarget((target ?? positionMs) + direction * step);
    setTarget(next);
    clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => jump(next), SEEK_COMMIT_MS);
  };

  const togglePause = () => {
    if (ended) jump(0);
    else setPaused((p) => !p);
    showOverlay();
  };

  const onError = () => {
    setPlaying(false);
    if (attempt.retries < RETRIES) {
      const retries = attempt.retries + 1;
      // Pick up where it stopped, not where this attempt began.
      setTimeout(() => setAttempt((a) => ({ n: a.n + 1, fromMs: latest.current.positionMs, retries })), RETRY_MS * retries);
    } else {
      setFailed(true);
      showOverlay();
    }
  };

  const close: Action = { key: 'close', icon: 'close', label: t('player.close'), run: moviePlayer.close };
  const actions: Action[] = [
    { key: 'pause', icon: paused || ended ? 'play' : 'pause', label: t(paused || ended ? 'player.play' : 'player.pause'), run: togglePause },
    { key: 'back', icon: 'rewind', label: t('player.back10'), run: () => jump(positionMs - TEN_MIN) },
    { key: 'fwd', icon: 'forward', label: t('player.forward10'), run: () => jump(positionMs + TEN_MIN) },
    { key: 'start', icon: 'catchup', label: t('player.restart'), run: () => jump(0) },
    close,
  ];
  const card: Action[] = ended
    ? [{ key: 'again', icon: 'catchup', label: t('player.watchAgain'), run: () => jump(0) }, close]
    : broken
      ? [{ key: 'retry', icon: 'catchup', label: t('player.tryAgain'), run: () => restartAt(positionMs) }, close]
      : [];
  const cardCount = ended || broken ? 2 : 0;
  const row = [...card, ...actions];
  const hl = splitHighlight(highlight, cardCount);
  const inRow = cardCount > 0 || (overlay && highlight !== -1);

  const onKey = (k: PlayerKey) => {
    switch (k) {
      case 'back':
        if (!cardCount && overlay && highlight !== -1) setHighlight(-1);
        else moviePlayer.close();
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
      case 'info':
        showOverlay();
        break;
      default:
        break;
    }
  };
  usePlayerKeys(onKey);

  const shown = target ?? positionMs;
  const progress = length ? Math.max(0, Math.min(1, shown / length)) : 0;

  return (
    <View style={styles.root}>
      {url && !broken && !ended ? (
        <Video
          key={`${url}#${attempt.n}`}
          url={url}
          live={false}
          paused={paused}
          startAt={attempt.fromMs / 1000}
          seek={seekReq}
          style={StyleSheet.absoluteFill}
          onPlaying={() => {
            setPlaying(true);
            setBuffering(false);
            setAttempt((a) => (a.retries ? { ...a, retries: 0 } : a));
          }}
          onBuffering={setBuffering}
          onDuration={(s) => setDurationMs(s * 1000)}
          onProgress={(s) => {
            // The first reports can still be 0 before the start position is applied.
            if (s === 0 && attempt.fromMs > 0) return;
            setPositionMs((p) => (Math.abs(p - s * 1000) < 500 ? p : s * 1000));
          }}
          onEnd={() => {
            // Stopping long before the end is a dropped connection, not the end.
            if (length && length - latest.current.positionMs > 3 * 60_000) return onError();
            setEnded(true);
            setPlaying(false);
            showOverlay();
          }}
          onError={onError}
        />
      ) : null}

      <Pressable style={StyleSheet.absoluteFill} focusable={false} accessible={false} onPress={() => (overlay ? setOverlay(false) : showOverlay())} />

      {!broken && !ended && !paused && (url === undefined || !playing || buffering) ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accentLight} />
        </View>
      ) : null}

      {cardCount ? (
        <ErrorCard
          title={t(ended ? 'movies.ended' : 'movies.error')}
          hint={t(ended ? 'movies.endedHint' : 'movies.errorHint')}
          actions={card}
          highlight={hl.card}
          onRun={(a) => a.run()}
        />
      ) : null}

      {target !== null ? (
        <View style={styles.bubble} pointerEvents="none">
          <Text weight="bold" size={32}>{formatClock(target)}</Text>
        </View>
      ) : null}

      {overlay ? (
        <View style={styles.panel} pointerEvents="box-none">
          <View style={styles.panelInner}>
            <Text weight="bold" size={20} numberOfLines={1}>{session.title}</Text>
            <View style={styles.timeRow}>
              <Text size={14} weight="semibold" color={target !== null ? colors.accentLight : colors.text}>{formatClock(shown)}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 1000) / 10}%` }]} />
              </View>
              <Text size={13} color={colors.textMuted}>{length ? formatClock(length) : '–:––'}</Text>
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
