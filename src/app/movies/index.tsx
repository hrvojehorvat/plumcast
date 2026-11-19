import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DefaultFocus,
  SpatialNavigationView,
  SpatialNavigationVirtualizedGrid,
  SpatialNavigationVirtualizedList,
  type SpatialNavigationNodeRef,
  type SpatialNavigationVirtualizedListRef,
} from 'react-tv-space-navigation';
import { CONTINUE, FAVORITES, type MovieItem, type MovieSort } from '../../data/movies';
import type { Playlist } from '../../data/playlists';
import { activePlaylist, usePlaylists } from '../../data/store';
import { useDebounced } from '../../live/useLive';
import { POSTER_TEXT, Poster } from '../../movies/Poster';
import { defaultMovieCategory, useMovieCategories, useMovieList, type MovieCategoryItem } from '../../movies/useMovies';
import { Button } from '../../ui/Button';
import { Focusable } from '../../ui/Focusable';
import { useI18n } from '../../ui/i18n';
import { Icon } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';
import { SearchField } from '../../ui/SearchField';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';
import { colors, radius } from '../../ui/tokens';
import { useWideLayout } from '../../ui/useWideLayout';

/**
 * Remembered while the app runs: coming back from a movie's page opens the same list, sort and
 * search, with the focus on the movie that was opened.
 */
const memory: { category: string | null; sort: MovieSort; query: string; focus: { list: string; id: string } | null } = {
  category: null,
  sort: 'recent',
  query: '',
  focus: null,
};
const CATEGORY_ITEM = 52;
const GAP = 18;
const MIN_POSTER = 150;

export default function MoviesScreen() {
  const { t } = useI18n();
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  const wide = useWideLayout();

  if (!state.ready) return null;
  if (!playlist) {
    return (
      <Screen title={t('nav.movies')}>
        <Text size={15} color={colors.textSoft}>{t('movies.noPlaylist')}</Text>
        <View style={styles.inlineButton}>
          <Button variant="primary" icon="plus" label={t('playlist.add')} onPress={() => router.push('/playlists/add')} />
        </View>
      </Screen>
    );
  }
  return wide ? <WideMovies playlist={playlist} /> : <PhoneMovies playlist={playlist} />;
}

function useMoviesScreen(playlist: Playlist) {
  const categories = useMovieCategories(playlist);
  const [chosen, setChosen] = useState<string | null>(memory.category);
  const [sort, setSortState] = useState<MovieSort>(memory.sort);
  const [query, setQueryState] = useState(memory.query);
  const debouncedQuery = useDebounced(query, 250);
  const selected = categories ? (chosen && categories.some((c) => c.id === chosen) ? chosen : defaultMovieCategory(categories)) : null;
  const select = (id: string) => {
    memory.category = id;
    memory.query = '';
    setChosen(id);
    setQueryState('');
  };
  const setSort = (value: MovieSort) => {
    memory.sort = value;
    setSortState(value);
  };
  const setQuery = (value: string) => {
    memory.query = value;
    setQueryState(value);
  };
  const movies = useMovieList(playlist, selected, debouncedQuery, sort);
  const category = categories?.find((c) => c.id === selected) ?? null;
  const listKey = `${selected}|${debouncedQuery}|${sort}`;
  const open = (movie: MovieItem) => {
    // Keep this list even if the default changes meanwhile (the movie may join Continue watching).
    memory.category = selected;
    memory.focus = { list: listKey, id: movie.id };
    router.push(`/movies/${encodeURIComponent(movie.id)}`);
  };
  return { categories, selected, select, sort, setSort, query, setQuery, debouncedQuery, movies, category, open, listKey };
}

function emptyText(t: ReturnType<typeof useI18n>['t'], selected: string | null, query: string): string {
  if (query.trim()) return t('movies.noResults', { query: query.trim() });
  if (selected === FAVORITES) return t('movies.noFavorites');
  if (selected === CONTINUE) return t('movies.noContinue');
  return t('movies.empty');
}

/** Columns and poster width that fill `width`. */
function gridFor(width: number) {
  const columns = Math.max(2, Math.floor((width + GAP) / (MIN_POSTER + GAP)));
  const poster = Math.floor((width - GAP * (columns - 1)) / columns);
  return { columns, poster, rowHeight: Math.round(poster * 1.5) + POSTER_TEXT + GAP };
}

// ---------------------------------------------------------------- TV / desktop

/**
 * Left column: search, sort and categories. Right: the poster grid. The grid is the only thing
 * on the right, so ▶ from a category always lands in it and ◀ from its first column comes back
 * to the category.
 */
function WideMovies({ playlist }: { playlist: Playlist }) {
  const { t } = useI18n();
  const screen = useMoviesScreen(playlist);
  const [categoryWidth, setCategoryWidth] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const grid = useRef<SpatialNavigationVirtualizedListRef>(null!);
  /** The movie whose page was open: its card gets the focus back. */
  const [returnId] = useState(() => memory.focus?.id ?? null);
  const returnCard = useRef<SpatialNavigationNodeRef>(null);
  const { columns, poster, rowHeight } = gridFor(gridWidth);
  const sortOptions = [
    { value: 'recent' as const, label: t('movies.sortRecent') },
    { value: 'az' as const, label: t('movies.sortAz') },
    { value: 'rating' as const, label: t('movies.sortRating') },
  ];

  // Back from a movie's page: put the focus on that movie again.
  const { movies, listKey } = screen;
  useEffect(() => {
    const focus = memory.focus;
    if (!movies || !focus || focus.list !== listKey || gridWidth === 0) return;
    memory.focus = null;
    const index = movies.findIndex((m) => m.id === focus.id);
    if (index < 0) return;
    // Scroll its row in first (so the card exists), then focus the card itself, not the row's first.
    const timers = [
      setTimeout(() => grid.current?.focus(Math.floor(index / columns)), 0),
      setTimeout(() => returnCard.current?.focus(), 60),
    ];
    return () => timers.forEach(clearTimeout);
  }, [movies, listKey, gridWidth, columns]);

  return (
    <SpatialNavigationView direction="horizontal" style={styles.wide}>
      <SpatialNavigationView direction="vertical" style={styles.side}>
        <Text weight="bold" size={30} style={styles.title}>{t('nav.movies')}</Text>
        <SearchField value={screen.query} onChangeText={screen.setQuery} placeholder={t('movies.search', { category: screen.category?.name ?? '' })} />
        <Segmented options={sortOptions} value={screen.sort} onChange={screen.setSort} />
        <View style={styles.listFill} onLayout={(e) => setCategoryWidth(e.nativeEvent.layout.width)}>
          {screen.categories && categoryWidth > 0 ? (
            <SpatialNavigationVirtualizedList
              data={screen.categories}
              itemSize={CATEGORY_ITEM}
              orientation="vertical"
              scrollBehavior="stick-to-start"
              additionalItemsRendered={6}
              renderItem={({ item }: { item: MovieCategoryItem }) => (
                <DefaultFocus enable={item.id === screen.selected && !memory.focus}>
                  <Focusable accessibilityLabel={item.name} onSelect={() => screen.select(item.id)} style={{ width: categoryWidth }}>
                    {({ isFocused }) => <CategoryRow item={item} selected={item.id === screen.selected} focused={isFocused} />}
                  </Focusable>
                </DefaultFocus>
              )}
            />
          ) : null}
        </View>
      </SpatialNavigationView>

      <View style={styles.main}>
        <View style={styles.mainHead}>
          <Text weight="semibold" size={20} numberOfLines={1} style={styles.flex}>{screen.category?.name ?? ''}</Text>
          {screen.movies ? <Text size={13} color={colors.textFaint}>{t('movies.count', { n: screen.movies.length })}</Text> : null}
        </View>
        <View style={styles.listFill} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {screen.movies === null || gridWidth === 0 ? (
            <Text size={14} color={colors.textMuted}>{t('movies.loading')}</Text>
          ) : screen.movies.length === 0 ? (
            <Text size={14} color={colors.textMuted} style={styles.empty}>{emptyText(t, screen.selected, screen.debouncedQuery)}</Text>
          ) : (
            <SpatialNavigationVirtualizedGrid
              key={`${screen.listKey}|${columns}`}
              ref={grid}
              data={screen.movies}
              numberOfColumns={columns}
              itemHeight={rowHeight}
              rowContainerStyle={styles.gridRow}
              scrollBehavior="stick-to-start"
              additionalRenderedRows={2}
              renderItem={({ item }: { item: MovieItem }) => (
                <Focusable accessibilityLabel={item.name} onSelect={() => screen.open(item)} focusRef={item.id === returnId ? returnCard : undefined}>
                  {({ isFocused }) => <Poster movie={item} width={poster} focused={isFocused} />}
                </Focusable>
              )}
            />
          )}
        </View>
      </View>
    </SpatialNavigationView>
  );
}

function CategoryRow({ item, selected, focused }: { item: MovieCategoryItem; selected: boolean; focused: boolean }) {
  const icon = item.id === FAVORITES ? 'star' : item.id === CONTINUE ? 'play' : null;
  return (
    <View style={[styles.category, selected && styles.categorySelected, focused && styles.categoryFocused]}>
      {icon ? <Icon name={icon} size={16} color={selected || focused ? colors.accentLight : colors.textFaint} /> : null}
      <Text weight={selected ? 'semibold' : 'regular'} size={15} numberOfLines={1} color={selected || focused ? colors.text : colors.textSoft} style={styles.flex}>
        {item.name}
      </Text>
      {item.count !== null ? <Text size={12} color={colors.textFaint}>{item.count}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------- phone

const PHONE_COLUMNS = 3;
const PHONE_GAP = 12;

function PhoneMovies({ playlist }: { playlist: Playlist }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const screen = useMoviesScreen(playlist);
  const [width, setWidth] = useState(0);
  const poster = Math.floor((width - 40 - PHONE_GAP * (PHONE_COLUMNS - 1)) / PHONE_COLUMNS);
  const sorts: { value: MovieSort; label: string }[] = [
    { value: 'recent', label: t('movies.sortRecent') },
    { value: 'az', label: t('movies.sortAz') },
    { value: 'rating', label: t('movies.sortRating') },
  ];

  return (
    <View style={[styles.phone, { paddingTop: insets.top + 12 }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text weight="bold" size={30} style={[styles.title, styles.phonePad]}>{t('nav.movies')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {screen.categories?.map((c) => {
          const on = c.id === screen.selected;
          return (
            <Pressable key={c.id} onPress={() => screen.select(c.id)} style={[styles.chip, on && styles.chipOn]}>
              <Text weight={on ? 'semibold' : 'medium'} size={14} color={on ? colors.text : colors.textSoft}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.phoneTools}>
        <SearchField value={screen.query} onChangeText={screen.setQuery} placeholder={t('movies.search', { category: screen.category?.name ?? '' })} />
        <View style={styles.sortRow}>
          {sorts.map((s) => {
            const on = s.value === screen.sort;
            return (
              <Pressable key={s.value} onPress={() => screen.setSort(s.value)} style={[styles.sortChip, on && styles.categorySelected]}>
                <Text weight={on ? 'semibold' : 'medium'} size={13} color={on ? colors.text : colors.textMuted}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {screen.movies && screen.movies.length === 0 ? (
        <Text size={14} color={colors.textMuted} style={[styles.phonePad, styles.empty]}>{emptyText(t, screen.selected, screen.debouncedQuery)}</Text>
      ) : poster > 0 ? (
        <FlatList
          key={screen.listKey}
          data={screen.movies ?? []}
          numColumns={PHONE_COLUMNS}
          keyExtractor={(m) => m.id}
          columnWrapperStyle={{ gap: PHONE_GAP }}
          contentContainerStyle={styles.phoneList}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={7}
          renderItem={({ item }) => (
            <Pressable onPress={() => screen.open(item)} accessibilityLabel={item.name}>
              <Poster movie={item} width={poster} focused={false} />
            </Pressable>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { letterSpacing: -1 },
  inlineButton: { flexDirection: 'row' },
  wide: { flex: 1, flexDirection: 'row', gap: 28, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 24, backgroundColor: colors.bg },
  side: { width: 270, gap: 14 },
  listFill: { flex: 1, minHeight: 0, overflow: 'hidden' },
  category: {
    height: CATEGORY_ITEM - 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categorySelected: { backgroundColor: colors.accentSoft },
  categoryFocused: { borderColor: colors.focusRing },
  main: { flex: 1, gap: 12, paddingTop: 8 },
  mainHead: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 12 },
  gridRow: { gap: GAP },
  empty: { lineHeight: 20, maxWidth: 420 },
  phone: { flex: 1, backgroundColor: colors.bg },
  phonePad: { paddingHorizontal: 20 },
  chipsScroll: { flexGrow: 0, flexShrink: 0, marginTop: 12 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: { height: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.glassStrong },
  chipOn: { backgroundColor: colors.accent },
  phoneTools: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 10 },
  sortRow: { flexDirection: 'row', gap: 8 },
  sortChip: { height: 32, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.glass },
  phoneList: { paddingHorizontal: 20, paddingBottom: 24, gap: PHONE_GAP },
});
