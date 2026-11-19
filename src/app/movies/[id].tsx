import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpatialNavigationView, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { formatClock, lengthParts, resumeAt, youtubeUrl } from '../../core/vod';
import { getMovie, setMovieFavorite, setWatched, useMoviesVersion, type MovieItem } from '../../data/movies';
import type { Playlist } from '../../data/playlists';
import { activePlaylist, usePlaylists } from '../../data/store';
import { useMovieInfo } from '../../data/vod';
import { MoviePoster } from '../../movies/Poster';
import { movieTitle } from '../../movies/useMovies';
import { moviePlayer } from '../../player/store';
import { Button } from '../../ui/Button';
import { useI18n } from '../../ui/i18n';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';
import { colors } from '../../ui/tokens';
import { useQuery } from '../../ui/useQuery';
import { useWideLayout } from '../../ui/useWideLayout';

const leave = () => (router.canGoBack() ? router.back() : router.navigate('/movies'));

/** One movie: details, play / resume, trailer, favourite and watched. */
export default function MovieDetails() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  const version = useMoviesVersion();
  const movie = useQuery(playlist && id ? `${playlist.id}|${playlist.syncedAt ?? 0}|${id}` : null, () => getMovie(playlist!.id, id), version);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, []);

  if (!state.ready) return null;
  const pad = wide ? styles.wide : { paddingTop: insets.top + 12 };

  if (movie === undefined || !playlist || !movie) {
    return (
      <SpatialNavigationView direction="vertical" style={{ ...styles.root, ...pad }}>
        <View style={[styles.head, !wide && styles.phonePad]}>
          <BackButton wide={wide} />
        </View>
        <Text size={14} color={colors.textMuted} style={!wide && styles.phonePad}>
          {t(movie === undefined && playlist ? 'movies.loading' : 'movies.notFound')}
        </Text>
      </SpatialNavigationView>
    );
  }
  return <Details playlist={playlist} movie={movie} wide={wide} topInset={insets.top} />;
}

function BackButton({ wide }: { wide: boolean }) {
  const { t } = useI18n();
  return wide ? (
    <Button icon="back" label={t('movies.back')} onPress={leave} />
  ) : (
    <Pressable accessibilityLabel={t('movies.back')} onPress={leave} hitSlop={10}>
      <Icon name="back" size={24} color={colors.text} />
    </Pressable>
  );
}

function Details({ playlist, movie, wide, topInset }: { playlist: Playlist; movie: MovieItem; wide: boolean; topInset: number }) {
  const { t } = useI18n();
  const info = useMovieInfo(playlist, movie.id);
  const [trailerFailed, setTrailerFailed] = useState(false);
  // The page opens with the remote on Play (not on the menu).
  const playButton = useRef<SpatialNavigationNodeRef>(null);
  useEffect(() => {
    const id = setTimeout(() => playButton.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [movie.id]);
  const { title, year } = movieTitle(movie.name, info?.year ?? null);
  const resume = resumeAt(movie.progress);
  const watched = movie.progress?.watched ?? false;
  const rating = info?.rating ?? movie.rating;
  const length = info?.durationMs ?? movie.progress?.durationMs ?? null;
  const backdrop = info?.backdrop ?? null;
  const poster = info?.poster ? { ...movie, logo: movie.logo ?? info.poster } : movie;

  const play = (fromMs: number) => moviePlayer.open(playlist.id, movie, year ? `${title} (${year})` : title, fromMs);
  const warn = (what: string) => (error: unknown) => console.warn(`[movies] ${what} failed`, error instanceof Error ? error.message : error);
  const openTrailer = () => {
    if (!info?.trailer) return;
    setTrailerFailed(false);
    Linking.openURL(youtubeUrl(info.trailer)).catch((error: unknown) => {
      warn('trailer')(error);
      setTrailerFailed(true);
    });
  };

  const meta: string[] = [];
  if (year) meta.push(String(year));
  if (length) {
    const { h, m } = lengthParts(length);
    meta.push(h ? t('movies.lengthHours', { h, m: String(m).padStart(2, '0') }) : t('movies.lengthMinutes', { m }));
  }
  if (rating) meta.push(`★ ${Math.round(rating * 10) / 10}`);
  if (info?.genre) meta.push(info.genre);

  const left = resume !== null && length ? length - resume : null;
  const posterWidth = wide ? 240 : 120;

  const buttons = (
    <SpatialNavigationView direction="horizontal" style={styles.buttons}>
      <Button
        focusRef={playButton}
        variant="primary"
        icon="play"
        label={resume !== null ? t('movies.resume', { time: formatClock(resume) }) : t('movies.play')}
        onPress={() => play(resume ?? 0)}
      />
      {resume !== null ? <Button icon="catchup" label={t('movies.fromStart')} onPress={() => play(0)} /> : null}
      {info?.trailer ? <Button icon="movies" label={t('movies.trailer')} onPress={openTrailer} /> : null}
      <Button
        icon="star"
        label={t(movie.favorite ? 'movies.unfavorite' : 'movies.favorite')}
        onPress={() => setMovieFavorite(playlist.id, movie.id, !movie.favorite).catch(warn('favourite'))}
      />
      <Button
        icon={watched ? 'undo' : 'check'}
        label={t(watched ? 'movies.markUnwatched' : 'movies.markWatched')}
        onPress={() => setWatched(playlist.id, movie.id, !watched).catch(warn('watched'))}
      />
    </SpatialNavigationView>
  );

  const body = (
    <>
      <View style={[styles.top, !wide && styles.topPhone]}>
        <MoviePoster movie={poster} width={posterWidth} focused={false} titleless />
        <View style={styles.flex}>
          <Text weight="bold" size={wide ? 40 : 26} numberOfLines={3} style={styles.title}>{title}</Text>
          {meta.length ? <Text size={15} color={colors.textSoft} style={styles.meta}>{meta.join('  ·  ')}</Text> : null}
          {watched ? (
            <View style={styles.badge}>
              <Icon name="check" size={14} color={colors.accentLight} />
              <Text size={13} weight="semibold" color={colors.accentLight}>{t('movies.watched')}</Text>
            </View>
          ) : left !== null ? (
            <Text size={13} color={colors.accentLight} style={styles.meta}>{t('movies.left', { time: formatClock(left) })}</Text>
          ) : null}
          {wide ? <View style={styles.buttonsWide}>{buttons}</View> : null}
          {trailerFailed ? <Text size={13} color={colors.textMuted}>{t('movies.trailerError')}</Text> : null}
        </View>
      </View>
      {!wide ? buttons : null}
      <View style={styles.text}>
        {info === undefined ? (
          <Text size={14} color={colors.textMuted}>{t('movies.loading')}</Text>
        ) : (
          <Text size={wide ? 17 : 15} color={colors.textSoft} style={styles.plot} numberOfLines={wide ? 6 : undefined}>
            {info?.plot ?? t('movies.noPlot')}
          </Text>
        )}
        {info?.director ? <Fact label={t('movies.director')} value={info.director} /> : null}
        {info?.cast ? <Fact label={t('movies.cast')} value={info.cast} lines={wide ? 2 : undefined} /> : null}
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      {backdrop ? (
        <>
          <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={wide ? 0 : 8} />
          <View style={[StyleSheet.absoluteFill, styles.shade]} />
        </>
      ) : null}
      <SpatialNavigationView direction="vertical" style={{ ...styles.flex, ...(wide ? styles.wide : { paddingTop: topInset + 12 }) }}>
        <View style={[styles.head, !wide && styles.phonePad]}>
          <BackButton wide={wide} />
        </View>
        {wide ? (
          <View style={styles.wideBody}>{body}</View>
        ) : (
          <ScrollView contentContainerStyle={styles.phoneBody}>{body}</ScrollView>
        )}
      </SpatialNavigationView>
    </View>
  );
}

function Fact({ label, value, lines }: { label: string; value: string; lines?: number }) {
  return (
    <Text size={14} color={colors.textMuted} numberOfLines={lines}>
      <Text size={14} weight="semibold" color={colors.textSoft}>{label}: </Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  root: { flex: 1, backgroundColor: colors.bg },
  shade: { backgroundColor: 'rgba(12,8,18,0.82)' },
  wide: { paddingHorizontal: 48, paddingTop: 32, paddingBottom: 24, gap: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  phonePad: { paddingHorizontal: 20 },
  wideBody: { maxWidth: 1100, gap: 28 },
  phoneBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 20 },
  top: { flexDirection: 'row', gap: 32, alignItems: 'flex-start' },
  topPhone: { gap: 16 },
  title: { letterSpacing: -1 },
  meta: { marginTop: 10 },
  badge: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  buttonsWide: { marginTop: 24, marginBottom: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  text: { gap: 12, maxWidth: 900 },
  plot: { lineHeight: 26 },
});
