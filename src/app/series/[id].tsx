import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpatialNavigationScrollView, SpatialNavigationView, SpatialNavigationVirtualizedList, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { Poster, yearAndRating } from '../../catalog/Poster';
import { allEpisodes, episodeLabel, nextEpisode, pickEpisode, type Episode, type EpisodeProgress, type Season } from '../../core/series';
import { formatClock, resumeAt, youtubeUrl } from '../../core/vod';
import type { Playlist } from '../../data/playlists';
import { getEpisodeProgress, getSeries, setEpisodeWatched, setSeriesFavorite, useSeriesVersion, type SeriesItem } from '../../data/series';
import { activePlaylist, usePlaylists } from '../../data/store';
import { useSeriesInfo } from '../../data/vod';
import { movieTitle } from '../../movies/useMovies';
import { moviePlayer } from '../../player/store';
import { EPISODE_ROW, EpisodeRow } from '../../series/EpisodeRow';
import { Button } from '../../ui/Button';
import { Focusable } from '../../ui/Focusable';
import { useI18n } from '../../ui/i18n';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';
import { colors, radius } from '../../ui/tokens';
import { useQuery } from '../../ui/useQuery';
import { useWideLayout } from '../../ui/useWideLayout';

const leave = () => (router.canGoBack() ? router.back() : router.navigate('/series'));
const NO_PROGRESS: ReadonlyMap<string, EpisodeProgress> = new Map();

/** One series: details, seasons, episodes with progress, play / resume, trailer, favourite. */
export default function SeriesDetails() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  const version = useSeriesVersion();
  const series = useQuery(playlist && id ? `${playlist.id}|${playlist.syncedAt ?? 0}|${id}` : null, () => getSeries(playlist!.id, id), version);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, []);

  if (!state.ready) return null;
  if (series === undefined || !playlist || !series) {
    return (
      <SpatialNavigationView
        direction="vertical"
        style={{
          ...styles.root,
          ...(wide ? styles.wide : { paddingTop: insets.top + 12 }),
        }}
      >
        <View style={[styles.head, !wide && styles.phonePad]}>
          <BackButton wide={wide} />
        </View>
        <Text size={14} color={colors.textMuted} style={!wide && styles.phonePad}>
          {t(series === undefined && playlist ? 'series.loading' : 'series.notFound')}
        </Text>
      </SpatialNavigationView>
    );
  }
  return <Details playlist={playlist} series={series} wide={wide} topInset={insets.top} />;
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

const warn = (what: string) => (error: unknown) => console.warn(`[series] ${what} failed`, error instanceof Error ? error.message : error);

function Details({ playlist, series, wide, topInset }: { playlist: Playlist; series: SeriesItem; wide: boolean; topInset: number }) {
  const { t } = useI18n();
  const info = useSeriesInfo(playlist, series);
  const version = useSeriesVersion();
  const seasons = info?.seasons ?? [];
  const ids = allEpisodes(seasons).map((e) => e.id);
  const progress = useQuery(info ? `${playlist.id}|${series.id}|${ids.length}` : null, () => getEpisodeProgress(playlist.id, ids), version) ?? NO_PROGRESS;
  const pick = pickEpisode(seasons, series.progress?.episodeId ?? null, progress);
  const [chosenSeason, setChosenSeason] = useState<number | null>(null);
  const season = seasons.find((s) => s.number === chosenSeason) ?? seasons.find((s) => s.number === pick?.episode.season) ?? seasons[0] ?? null;
  const [trailerFailed, setTrailerFailed] = useState(false);
  const [listWidth, setListWidth] = useState(0);

  // The page opens with the remote on Play (not on the menu).
  const playButton = useRef<SpatialNavigationNodeRef>(null);
  useEffect(() => {
    const timer = setTimeout(() => playButton.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [series.id]);

  const { title, year } = movieTitle(series.name, info?.year ?? series.year);
  const rating = info?.rating ?? series.rating;
  const backdrop = info?.backdrop ?? null;
  const cover = series.cover ?? info?.cover ?? null;
  const plot = info?.plot ?? series.plot;

  const play = (episode: Episode, fromMs: number) => moviePlayer.openEpisode(playlist.id, series, seasons, episode, fromMs);
  const resumeOf = (episode: Episode) => {
    const p = progress.get(episode.id);
    return p ? resumeAt({ ...p, durationMs: p.durationMs ?? episode.durationMs }) : null;
  };
  const playEpisode = (episode: Episode) => play(episode, resumeOf(episode) ?? 0);
  const toggleWatched = (episode: Episode) => {
    const watched = progress.get(episode.id)?.watched ?? false;
    setEpisodeWatched(playlist.id, series.id, episode, !watched, !nextEpisode(seasons, episode.id)).catch(warn('watched'));
  };
  const openTrailer = () => {
    if (!info?.trailer) return;
    setTrailerFailed(false);
    Linking.openURL(youtubeUrl(info.trailer)).catch((error: unknown) => {
      warn('trailer')(error);
      setTrailerFailed(true);
    });
  };

  const meta: string[] = [];
  const yr = yearAndRating(year, rating);
  if (yr) meta.push(yr);
  const playable = seasons.filter((s) => s.episodes.length);
  if (playable.length) meta.push(playable.length === 1 ? t('series.oneSeason') : t('series.seasons', { n: playable.length }));
  if (info?.genre) meta.push(info.genre);

  const playLabel = pick
    ? pick.resumeMs !== null
      ? t('series.resume', {
          episode: episodeLabel(pick.episode),
          time: formatClock(pick.resumeMs),
        })
      : t('series.play', { episode: episodeLabel(pick.episode) })
    : t('movies.play');

  const buttons = (
    <SpatialNavigationView direction="horizontal" style={styles.buttons}>
      <Button focusRef={playButton} variant="primary" icon="play" label={playLabel} disabled={!pick} onPress={() => pick && play(pick.episode, pick.resumeMs ?? 0)} />
      {info?.trailer ? <Button icon="movies" label={t('movies.trailer')} onPress={openTrailer} /> : null}
      <Button icon="star" label={t(series.favorite ? 'movies.unfavorite' : 'movies.favorite')} onPress={() => setSeriesFavorite(playlist.id, series.id, !series.favorite).catch(warn('favourite'))} />
    </SpatialNavigationView>
  );

  const facts = (
    <>
      <Text size={wide ? 16 : 15} color={colors.textSoft} style={styles.plot} numberOfLines={wide ? 5 : undefined}>
        {plot ?? (info === undefined ? '' : t('series.noPlot'))}
      </Text>
      {info?.director ? <Fact label={t('movies.director')} value={info.director} /> : null}
      {info?.cast ? <Fact label={t('movies.cast')} value={info.cast} lines={2} /> : null}
      {trailerFailed ? (
        <Text size={13} color={colors.textMuted}>
          {t('movies.trailerError')}
        </Text>
      ) : null}
    </>
  );

  const episodesState = info === undefined ? t('series.loadingEpisodes') : info === null ? t('series.episodesError') : !seasons.length ? t('series.noEpisodes') : null;

  const background = backdrop ? (
    <>
      <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={wide ? 0 : 8} />
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
    </>
  ) : null;

  if (wide) {
    return (
      <View style={styles.root}>
        {background}
        <SpatialNavigationView direction="horizontal" style={styles.wideRoot}>
          <SpatialNavigationView direction="vertical" style={styles.left}>
            <View style={styles.head}>
              <BackButton wide />
            </View>
            <View style={styles.titleRow}>
              <Poster title={title} image={cover} width={110} focused={false} titleless />
              <View style={styles.flex}>
                <Text weight="bold" size={32} numberOfLines={3} style={styles.title}>
                  {title}
                </Text>
                {meta.length ? (
                  <Text size={14} color={colors.textSoft} style={styles.meta}>
                    {meta.join('  ·  ')}
                  </Text>
                ) : null}
              </View>
            </View>
            {buttons}
            <View style={styles.facts}>{facts}</View>
          </SpatialNavigationView>

          <SpatialNavigationView direction="vertical" style={styles.right}>
            {episodesState ? (
              <Text size={14} color={colors.textMuted} style={styles.state}>
                {episodesState}
              </Text>
            ) : (
              <>
                <SeasonChips seasons={seasons} selected={season?.number ?? null} onSelect={setChosenSeason} wide />
                <View style={styles.listFill} onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}>
                  {season && listWidth ? (
                    <SpatialNavigationVirtualizedList
                      key={season.number}
                      data={season.episodes}
                      itemSize={EPISODE_ROW}
                      orientation="vertical"
                      scrollBehavior="stick-to-start"
                      additionalItemsRendered={4}
                      renderItem={({ item }: { item: Episode }) => <WideEpisode width={listWidth} episode={item} progress={progress.get(item.id)} onPlay={playEpisode} onToggleWatched={toggleWatched} />}
                    />
                  ) : null}
                </View>
              </>
            )}
          </SpatialNavigationView>
        </SpatialNavigationView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {background}
      <View style={[styles.flex, { paddingTop: topInset + 12 }]}>
        <View style={[styles.head, styles.phonePad]}>
          <BackButton wide={false} />
        </View>
        <ScrollView contentContainerStyle={styles.phoneBody}>
          <View style={styles.titleRow}>
            <Poster title={title} image={cover} width={110} focused={false} titleless />
            <View style={styles.flex}>
              <Text weight="bold" size={26} numberOfLines={3} style={styles.title}>
                {title}
              </Text>
              {meta.length ? (
                <Text size={14} color={colors.textSoft} style={styles.meta}>
                  {meta.join('  ·  ')}
                </Text>
              ) : null}
            </View>
          </View>
          {buttons}
          {facts}
          {episodesState ? (
            <Text size={14} color={colors.textMuted}>
              {episodesState}
            </Text>
          ) : (
            <>
              <SeasonChips seasons={seasons} selected={season?.number ?? null} onSelect={setChosenSeason} wide={false} />
              {season?.episodes.map((e) => (
                <View key={e.id} style={styles.phoneEpisode}>
                  <Pressable style={styles.flex} onPress={() => playEpisode(e)} accessibilityLabel={e.title ?? t('series.episode', { n: e.number })}>
                    <EpisodeRow episode={e} progress={progress.get(e.id)} focused={false} compact />
                  </Pressable>
                  <WatchedToggle watched={progress.get(e.id)?.watched ?? false} onPress={() => toggleWatched(e)} />
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function seasonName(t: ReturnType<typeof useI18n>['t'], season: Season) {
  return season.number === 0 ? t('series.specials') : t('series.season', { n: season.number });
}

/** Season tabs. On TV the season switches as the focus moves over it. */
function SeasonChips({ seasons, selected, onSelect, wide }: { seasons: readonly Season[]; selected: number | null; onSelect: (n: number) => void; wide: boolean }) {
  const { t } = useI18n();
  if (seasons.length < 2) {
    const only = seasons[0];
    return only ? (
      <Text weight="semibold" size={17} style={styles.seasonTitle}>
        {seasonName(t, only)} · {t('series.episodes', { n: only.episodes.length })}
      </Text>
    ) : null;
  }
  if (!wide) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {seasons.map((s) => {
          const on = s.number === selected;
          return (
            <Pressable key={s.number} onPress={() => onSelect(s.number)} style={[styles.chip, on && styles.chipOn]}>
              <Text weight={on ? 'semibold' : 'medium'} size={14} color={on ? colors.text : colors.textSoft}>
                {seasonName(t, s)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }
  return (
    <View style={styles.chipsBox}>
      <SpatialNavigationScrollView horizontal offsetFromStart={60} style={styles.chipsScroll}>
        <SpatialNavigationView direction="horizontal" style={styles.chips}>
          {seasons.map((s) => {
            const on = s.number === selected;
            return (
              <Focusable key={s.number} accessibilityLabel={seasonName(t, s)} onFocus={() => onSelect(s.number)} onSelect={() => onSelect(s.number)}>
                {({ isFocused }) => (
                  <View style={[styles.chip, on && styles.chipOn, isFocused && styles.chipFocused]}>
                    <Text weight={on ? 'semibold' : 'medium'} size={14} color={on || isFocused ? colors.text : colors.textSoft}>
                      {seasonName(t, s)}
                    </Text>
                  </View>
                )}
              </Focusable>
            );
          })}
        </SpatialNavigationView>
      </SpatialNavigationScrollView>
    </View>
  );
}

/** Episode row for the remote: OK plays (resuming), ▶ reaches the watched toggle. */
function WideEpisode({ width, episode, progress, onPlay, onToggleWatched }: { width: number; episode: Episode; progress: EpisodeProgress | undefined; onPlay: (e: Episode) => void; onToggleWatched: (e: Episode) => void }) {
  const { t } = useI18n();
  const watched = progress?.watched ?? false;
  return (
    <SpatialNavigationView direction="horizontal" style={{ ...styles.episodeLine, width }}>
      <Focusable accessibilityLabel={episode.title ?? t('series.episode', { n: episode.number })} onSelect={() => onPlay(episode)} style={styles.flex}>
        {({ isFocused }) => <EpisodeRow episode={episode} progress={progress} focused={isFocused} />}
      </Focusable>
      <Focusable accessibilityLabel={t(watched ? 'movies.markUnwatched' : 'movies.markWatched')} onSelect={() => onToggleWatched(episode)}>
        {({ isFocused }) => <WatchedMark watched={watched} focused={isFocused} />}
      </Focusable>
    </SpatialNavigationView>
  );
}

function WatchedMark({ watched, focused }: { watched: boolean; focused: boolean }) {
  return (
    <View style={[styles.mark, watched && styles.markOn, focused && styles.markFocused]}>
      <Icon name="check" size={18} color={watched ? '#ffffff' : focused ? colors.text : colors.textFaint} />
    </View>
  );
}

function WatchedToggle({ watched, onPress }: { watched: boolean; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={t(watched ? 'movies.markUnwatched' : 'movies.markWatched')}>
      <WatchedMark watched={watched} focused={false} />
    </Pressable>
  );
}

function Fact({ label, value, lines }: { label: string; value: string; lines?: number }) {
  return (
    <Text size={14} color={colors.textMuted} numberOfLines={lines}>
      <Text size={14} weight="semibold" color={colors.textSoft}>
        {label}:{' '}
      </Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  root: { flex: 1, backgroundColor: colors.bg },
  shade: { backgroundColor: 'rgba(12,8,18,0.86)' },
  wide: { paddingHorizontal: 48, paddingTop: 32, paddingBottom: 24, gap: 24 },
  wideRoot: {
    flex: 1,
    flexDirection: 'row',
    gap: 36,
    paddingHorizontal: 40,
    paddingTop: 32,
    paddingBottom: 20,
  },
  left: { width: 420, gap: 20 },
  right: { flex: 1, minWidth: 0, gap: 14, paddingTop: 60 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  phonePad: { paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  title: { letterSpacing: -0.8 },
  meta: { marginTop: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  facts: { gap: 10 },
  plot: { lineHeight: 24 },
  state: { lineHeight: 20, maxWidth: 420 },
  listFill: { flex: 1, minHeight: 0, overflow: 'hidden' },
  seasonTitle: { height: 40, lineHeight: 40 },
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chipsBox: { height: 42 },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: {
    height: 38,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.glassStrong,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: colors.accent },
  chipFocused: { borderColor: colors.focusRing },
  episodeLine: {
    height: EPISODE_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  markOn: { backgroundColor: colors.accent },
  markFocused: { borderColor: colors.focusRing },
  phoneBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 18,
  },
  phoneEpisode: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
