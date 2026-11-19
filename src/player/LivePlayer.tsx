import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useLockSpatialNavigation } from 'react-tv-space-navigation';
import { replayDays } from '../core/catchup';
import { useTimeFormat } from '../ui/useTimeFormat';
import { addRecent, channelByNumber, setFavorite } from '../data/live';
import { useNowNext } from '../data/epg';
import { usePlaylists } from '../data/store';
import { useStreamUrl } from '../live/useLive';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';
import { addDigit, type PlayerKey } from './keys';
import { ActionBar, ErrorCard, moveHighlight, playerStyles as styles, splitHighlight, type Action } from './parts';
import { ReplayPlayer } from './ReplayPlayer';
import { MoviePlayer } from './MoviePlayer';
import { livePlayer, useLiveSession, useMovieSession, type LiveSession } from './store';
import { usePlayerKeys } from './usePlayerKeys';
import { Video } from './Video';

const INFO_MS = 6000;
const DIGIT_MS = 1500;
const RETRY_MS = 1500;

/** Mounted once at the root; shows the full-screen player while a session is open (live or replay). */
export function LivePlayerHost() {
  const session = useLiveSession();
  const movie = useMovieSession();
  if (movie) return <MoviePlayer key={`${movie.playlistId}|${movie.movie.id}`} session={movie} />;
  if (!session) return null;
  return session.replay ? <ReplayPlayer session={session} replay={session.replay} /> : <LivePlayer session={session} />;
}

interface Playback {
  url: string | null;
  attempt: number;
  playing: boolean;
  buffering: boolean;
  failed: boolean;
}
const freshPlayback = (url: string | null): Playback => ({ url, attempt: 0, playing: false, buffering: false, failed: false });

function LivePlayer({ session }: { session: LiveSession }) {
  const { t } = useI18n();
  const { list: playlistList } = usePlaylists();
  const playlist = playlistList.find((p) => p.id === session.playlistId) ?? null;
  const channel = session.current;
  const info = useNowNext(playlist, channel.id);
  const { lock, unlock } = useLockSpatialNavigation();

  const url = useStreamUrl(playlist, channel);
  // Playback status belongs to one URL; a new channel starts fresh.
  const [playback, setPlayback] = useState<Playback>(() => freshPlayback(null));
  const status = playback.url === url ? playback : freshPlayback(url ?? null);
  const update = (patch: Partial<Playback>) => setPlayback((p) => ({ ...(p.url === url ? p : freshPlayback(url ?? null)), ...patch }));
  const failed = url === null || status.failed;

  const [overlay, setOverlay] = useState(true);
  const [activity, setActivity] = useState(0);
  const [highlight, setHighlight] = useState(-1);
  const [digits, setDigits] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const digitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Info shows for a few seconds on every channel change.
  const [infoFor, setInfoFor] = useState(channel.id);
  if (infoFor !== channel.id) {
    setInfoFor(channel.id);
    setOverlay(true);
  }
  const showOverlay = () => {
    setOverlay(true);
    setActivity((n) => n + 1);
  };
  useEffect(() => {
    if (!overlay) return;
    const id = setTimeout(() => {
      setOverlay(false);
      setHighlight(-1);
    }, INFO_MS);
    return () => clearTimeout(id);
  }, [overlay, activity, channel.id]);

  // The app's own focus navigation stays still while the player has the remote.
  useEffect(() => {
    lock();
    return () => unlock();
  }, [lock, unlock]);

  // Remember the channel as recently watched.
  const playlistId = playlist?.id;
  useEffect(() => {
    if (playlistId) void addRecent(playlistId, channel.id).catch(() => undefined);
  }, [playlistId, channel.id]);

  useEffect(() => () => clearTimeout(digitTimer.current), []);

  const onError = () => {
    // One quiet retry: with single-connection accounts the previous stream may still count for a moment.
    if (status.attempt === 0) {
      update({ playing: false });
      setTimeout(() => update({ attempt: 1 }), RETRY_MS);
    } else {
      update({ playing: false, failed: true });
      showOverlay();
    }
  };

  const toggleFavorite = () => {
    if (!playlist) return;
    const favorite = !channel.favorite;
    livePlayer.patchCurrent({ favorite });
    void setFavorite(playlist.id, channel.id, favorite);
  };

  const now = info?.now;
  const next = info?.next;
  // What's on now on a channel that records can be watched from its start.
  const restartable = replayDays(channel) > 0 && now ? now : null;
  const openArchive = () => {
    livePlayer.close();
    router.push(`/catchup/${encodeURIComponent(channel.id)}`);
  };

  const actions: Action[] = [
    { key: 'fav', icon: 'star', filled: channel.favorite, label: t(channel.favorite ? 'player.unfavorite' : 'player.favorite'), run: toggleFavorite },
    ...(session.previous ? [{ key: 'last', icon: 'undo' as const, label: t('player.lastChannel'), run: livePlayer.back }] : []),
    ...(restartable && playlist
      ? [{ key: 'restart', icon: 'catchup' as const, label: t('player.fromStart'), run: () => livePlayer.openReplay(playlist.id, session.list, channel, restartable) }]
      : []),
    ...(replayDays(channel) > 0 ? [{ key: 'archive', icon: 'archive' as const, label: t('player.catchup'), run: openArchive }] : []),
    { key: 'down', icon: 'up' as const, label: t('player.channelDown'), run: () => livePlayer.step(-1) },
    { key: 'up', icon: 'down' as const, label: t('player.channelUp'), run: () => livePlayer.step(1) },
    { key: 'close', icon: 'close' as const, label: t('player.close'), run: livePlayer.close },
  ];

  // A channel that won't play: a card with its own buttons, first in the remote's ◀/▶ row.
  const card: Action[] = failed
    ? [
        { key: 'retry', icon: 'catchup', label: t('player.tryAgain'), run: () => { setHighlight(-1); update({ failed: false, playing: false, attempt: status.attempt + 1 }); } },
        { key: 'close', icon: 'close', label: t('player.close'), run: livePlayer.close },
      ]
    : [];
  const row = [...card, ...actions];
  const cardCount = failed ? 2 : 0;
  const hl = splitHighlight(highlight, cardCount);

  const commitDigits = async (value: string) => {
    setDigits('');
    const n = Number(value);
    const inList = session.list.find((c) => c.num === n);
    const target = inList ?? (await channelByNumber(session.playlistId, n).catch(() => null));
    if (target) livePlayer.tune(target);
    else {
      setNotice(t('player.noChannel', { n }));
      setTimeout(() => setNotice(null), 2500);
    }
  };

  const onKey = (key: PlayerKey) => {
    if (key.startsWith('digit')) {
      const value = addDigit(digits, key.slice(5));
      setDigits(value);
      clearTimeout(digitTimer.current);
      digitTimer.current = setTimeout(() => void commitDigits(value), DIGIT_MS);
      return;
    }
    switch (key) {
      case 'back':
        if (!cardCount && overlay && highlight !== -1) {
          setOverlay(false);
          setHighlight(-1);
        } else livePlayer.close();
        break;
      // Arrows follow the list on screen (▲ = channel above); CH+/CH− follow the numbers.
      case 'up':
      case 'channelDown':
        livePlayer.step(-1);
        break;
      case 'down':
      case 'channelUp':
        livePlayer.step(1);
        break;
      case 'left':
      case 'right':
        showOverlay();
        setHighlight(moveHighlight(hl.effective, key, row.length));
        break;
      case 'select':
        if (cardCount || (overlay && highlight !== -1)) {
          row[hl.effective]?.run();
          showOverlay();
        } else if (overlay) {
          setOverlay(false);
        } else showOverlay();
        break;
      case 'info':
        showOverlay();
        break;
    }
  };
  usePlayerKeys(onKey);

  const time = useTimeFormat();

  return (
    <View style={styles.root}>
      {url && !failed ? (
        <Video
          key={`${url}#${status.attempt}`}
          url={url}
          style={StyleSheet.absoluteFill}
          onPlaying={() => update({ playing: true, buffering: false })}
          onBuffering={(buffering) => update({ buffering })}
          onError={onError}
        />
      ) : null}

      {/* Phones: tap the picture to show / hide the info. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        focusable={false}
        accessible={false}
        onPress={() => (overlay ? setOverlay(false) : showOverlay())}
      />

      {!failed && (!status.playing || status.buffering) ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accentLight} />
        </View>
      ) : null}

      {failed ? <ErrorCard title={t('player.error')} hint={t('player.errorHint')} actions={card} highlight={hl.card} onRun={(a) => a.run()} /> : null}

      {digits || notice ? (
        <View style={styles.bubble} pointerEvents="none">
          <Text weight="bold" size={digits ? 44 : 18}>{digits || notice}</Text>
        </View>
      ) : null}

      {overlay ? (
        <View style={styles.panel} pointerEvents="box-none">
          <View style={styles.panelInner}>
            <View style={styles.channelLine}>
              {channel.num !== null ? <Text weight="bold" size={22} color={colors.accentLight}>{channel.num}</Text> : null}
              {channel.logo ? <Image source={{ uri: channel.logo }} style={styles.logo} resizeMode="contain" /> : null}
              <Text weight="bold" size={22} numberOfLines={1} style={styles.flex}>{channel.name}</Text>
              {channel.favorite ? <Icon name="star" size={20} color={colors.accentLight} filled /> : null}
            </View>
            {now ? (
              <View style={styles.programme}>
                <Text weight="semibold" size={17} numberOfLines={1}>
                  <Text weight="semibold" size={13} color={colors.accentLight}>{t('live.now').toUpperCase()}  </Text>
                  {now.title}
                </Text>
                <View style={styles.timeRow}>
                  <Text size={13} color={colors.textMuted}>{time(now.start)}</Text>
                  <View style={styles.track}><View style={[styles.fill, { width: `${Math.round((info?.progress ?? 0) * 100)}%` }]} /></View>
                  <Text size={13} color={colors.textMuted}>{time(now.end)}</Text>
                </View>
                {next ? (
                  <Text size={14} color={colors.textSoft} numberOfLines={1}>
                    <Text weight="semibold" size={13} color={colors.textMuted}>{t('live.next').toUpperCase()}  </Text>
                    {time(next.start)} · {next.title}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text size={14} color={colors.textMuted}>{t('live.noGuide')}</Text>
            )}
            <ActionBar
              actions={actions}
              highlight={hl.bar}
              onRun={(a) => {
                a.run();
                showOverlay();
              }}
            />
            {Platform.isTV || Platform.OS === 'web' ? <Text size={12} color={colors.textFaint}>{t('player.keysHint')}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
