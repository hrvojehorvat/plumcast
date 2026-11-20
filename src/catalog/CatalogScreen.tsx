import { CurrentMark } from '../ui/CurrentMark';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactElement } from 'react';
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
import { ALL, CONTINUE, FAVORITES } from '../data/movies';
import type { Playlist } from '../data/playlists';
import { activePlaylist, usePlaylists } from '../data/store';
import { useDebounced } from '../live/useLive';
import { Button } from '../ui/Button';
import { Focusable } from '../ui/Focusable';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Screen } from '../ui/Screen';
import { SearchField } from '../ui/SearchField';
import { Segmented } from '../ui/Segmented';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useFocusSelect } from '../ui/useFocusSelect';
import { useWideLayout } from '../ui/useWideLayout';
import { POSTER_TEXT } from './Poster';

export type CatalogSort = 'recent' | 'az' | 'rating';
export type SectionKey = 'movies' | 'series';

export interface CatalogCategory {
  id: string;
  name: string;
  count: number | null;
}

/** What differs between the movie and the series grid. */
export interface CatalogSection<T extends { id: string; name: string }> {
  key: SectionKey;
  useCategories: (playlist: Playlist) => CatalogCategory[] | null;
  useList: (playlist: Playlist, categoryId: string | null, query: string, sort: CatalogSort) => T[] | null;
  renderPoster: (item: T, width: number, focused: boolean) => ReactElement;
}

/** First list: continue watching when something is started, else the first provider category. */
export function defaultCategory(items: readonly CatalogCategory[]): string {
  if (items.find((c) => c.id === CONTINUE)?.count) return CONTINUE;
  return items.find((c) => c.id !== CONTINUE && c.id !== FAVORITES && c.id !== ALL)?.id ?? ALL;
}

/**
 * Remembered per section while the app runs: coming back from a detail page opens the same list,
 * sort and search, with the focus on the item that was opened.
 */
interface Memory {
  category: string | null;
  sort: CatalogSort;
  query: string;
  focus: { list: string; id: string } | null;
}
const memories: Record<SectionKey, Memory> = {
  movies: { category: null, sort: 'recent', query: '', focus: null },
  series: { category: null, sort: 'recent', query: '', focus: null },
};
const CATEGORY_ITEM = 52;
const GAP = 18;
const MIN_POSTER = 150;

/** Movies or series: categories, search and sort, then a poster grid. */
export function CatalogScreen<T extends { id: string; name: string }>({ section }: { section: CatalogSection<T> }) {
  const { t } = useI18n();
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  const wide = useWideLayout();

  if (!state.ready) return null;
  if (!playlist) {
    return (
      <Screen title={t(`nav.${section.key}`)}>
        <Text size={15} color={colors.textSoft}>{t(`${section.key}.noPlaylist`)}</Text>
        <View style={styles.inlineButton}>
          <Button variant="primary" icon="plus" label={t('playlist.add')} onPress={() => router.push('/playlists/add')} />
        </View>
      </Screen>
    );
  }
  return wide ? <WideCatalog section={section} playlist={playlist} /> : <PhoneCatalog section={section} playlist={playlist} />;
}

function useCatalog<T extends { id: string; name: string }>(section: CatalogSection<T>, playlist: Playlist) {
  const memory = memories[section.key];
  const categories = section.useCategories(playlist);
  const [chosen, setChosen] = useState<string | null>(memory.category);
  const [sort, setSortState] = useState<CatalogSort>(memory.sort);
  const [query, setQueryState] = useState(memory.query);
  const debouncedQuery = useDebounced(query, 250);
  const selected = categories ? (chosen && categories.some((c) => c.id === chosen) ? chosen : defaultCategory(categories)) : null;
  const select = (id: string) => {
    memory.category = id;
    memory.query = '';
    setChosen(id);
    setQueryState('');
  };
  const setSort = (value: CatalogSort) => {
    memory.sort = value;
    setSortState(value);
  };
  const setQuery = (value: string) => {
    memory.query = value;
    setQueryState(value);
  };
  const items = section.useList(playlist, selected, debouncedQuery, sort);
  const category = categories?.find((c) => c.id === selected) ?? null;
  const listKey = `${selected}|${debouncedQuery}|${sort}`;
  const open = (item: T) => {
    // Keep this list even if the default changes meanwhile (the item may join Continue watching).
    memory.category = selected;
    memory.focus = { list: listKey, id: item.id };
    router.push(`/${section.key}/${encodeURIComponent(item.id)}`);
  };
  return { categories, selected, select, sort, setSort, query, setQuery, debouncedQuery, items, category, open, listKey };
}

function useTexts(key: SectionKey) {
  const { t } = useI18n();
  return {
    t,
    title: t(`nav.${key}`),
    search: (category: string) => t(`${key}.search`, { category }),
    count: (n: number) => t(`${key}.count`, { n }),
    loading: t(`${key}.loading`),
    sorts: [
      { value: 'recent' as const, label: t(`${key}.sortRecent`) },
      { value: 'az' as const, label: t(`${key}.sortAz`) },
      { value: 'rating' as const, label: t(`${key}.sortRating`) },
    ],
    empty: (selected: string | null, query: string) => {
      if (query.trim()) return t(`${key}.noResults`, { query: query.trim() });
      if (selected === FAVORITES) return t(`${key}.noFavorites`);
      if (selected === CONTINUE) return t(`${key}.noContinue`);
      return t(`${key}.empty`);
    },
  };
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
function WideCatalog<T extends { id: string; name: string }>({ section, playlist }: { section: CatalogSection<T>; playlist: Playlist }) {
  const texts = useTexts(section.key);
  const screen = useCatalog(section, playlist);
  const focusCategory = useFocusSelect(screen.selected, screen.select);
  const memory = memories[section.key];
  const [categoryWidth, setCategoryWidth] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const grid = useRef<SpatialNavigationVirtualizedListRef>(null!);
  /** The item whose page was open: its card gets the focus back. */
  const [returnId] = useState(() => memory.focus?.id ?? null);
  const returnCard = useRef<SpatialNavigationNodeRef>(null);
  const { columns, poster, rowHeight } = gridFor(gridWidth);

  // Back from a detail page: put the focus on that item again.
  const { items, listKey } = screen;
  const key = section.key;
  useEffect(() => {
    const focus = memories[key].focus;
    if (!items || !focus || focus.list !== listKey || gridWidth === 0) return;
    memories[key].focus = null;
    const index = items.findIndex((m) => m.id === focus.id);
    if (index < 0) return;
    // Scroll its row in first (so the card exists), then focus the card itself, not the row's first.
    const timers = [
      setTimeout(() => grid.current?.focus(Math.floor(index / columns)), 0),
      setTimeout(() => returnCard.current?.focus(), 60),
    ];
    return () => timers.forEach(clearTimeout);
  }, [items, listKey, gridWidth, columns, key]);

  return (
    <SpatialNavigationView direction="horizontal" style={styles.wide}>
      <SpatialNavigationView direction="vertical" style={styles.side}>
        <Text weight="bold" size={30} style={styles.title}>{texts.title}</Text>
        <SearchField value={screen.query} onChangeText={screen.setQuery} placeholder={texts.search(screen.category?.name ?? '')} />
        <Segmented options={texts.sorts} value={screen.sort} onChange={screen.setSort} />
        <View style={styles.listFill} onLayout={(e) => setCategoryWidth(e.nativeEvent.layout.width)}>
          {screen.categories && categoryWidth > 0 ? (
            <SpatialNavigationVirtualizedList
              data={screen.categories}
              itemSize={CATEGORY_ITEM}
              orientation="vertical"
              scrollBehavior="stick-to-start"
              additionalItemsRendered={6}
              renderItem={({ item }: { item: CatalogCategory }) => (
                <DefaultFocus enable={item.id === screen.selected && !memory.focus}>
                  <Focusable accessibilityLabel={item.name} onFocus={() => focusCategory.onFocus(item.id)} onBlur={() => focusCategory.onBlur(item.id)} onSelect={() => screen.select(item.id)} style={{ width: categoryWidth }}>
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
          {screen.items ? <Text size={13} color={colors.textFaint}>{texts.count(screen.items.length)}</Text> : null}
        </View>
        <View style={styles.listFill} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {screen.items === null || gridWidth === 0 ? (
            <Text size={14} color={colors.textMuted}>{texts.loading}</Text>
          ) : screen.items.length === 0 ? (
            <Text size={14} color={colors.textMuted} style={styles.empty}>{texts.empty(screen.selected, screen.debouncedQuery)}</Text>
          ) : (
            <SpatialNavigationVirtualizedGrid
              key={`${screen.listKey}|${columns}`}
              ref={grid}
              data={screen.items}
              numberOfColumns={columns}
              itemHeight={rowHeight}
              rowContainerStyle={styles.gridRow}
              scrollBehavior="stick-to-start"
              additionalRenderedRows={2}
              renderItem={({ item }: { item: T }) => (
                <Focusable accessibilityLabel={item.name} onSelect={() => screen.open(item)} focusRef={item.id === returnId ? returnCard : undefined}>
                  {({ isFocused }) => section.renderPoster(item, poster, isFocused)}
                </Focusable>
              )}
            />
          )}
        </View>
      </View>
    </SpatialNavigationView>
  );
}

function CategoryRow({ item, selected, focused }: { item: CatalogCategory; selected: boolean; focused: boolean }) {
  const icon = item.id === FAVORITES ? 'star' : item.id === CONTINUE ? 'play' : null;
  return (
    <View style={[styles.category, focused && styles.categoryFocused]}>
      {selected && !focused ? <CurrentMark /> : null}
      {icon ? <Icon name={icon} size={16} color={selected || focused ? colors.accentLight : colors.textFaint} /> : null}
      <Text weight={selected ? 'semibold' : 'regular'} size={15} numberOfLines={1} color={focused ? colors.text : selected ? colors.accentLight : colors.textSoft} style={styles.flex}>
        {item.name}
      </Text>
      {item.count !== null ? <Text size={12} color={colors.textFaint}>{item.count}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------- phone

const PHONE_COLUMNS = 3;
const PHONE_GAP = 12;

function PhoneCatalog<T extends { id: string; name: string }>({ section, playlist }: { section: CatalogSection<T>; playlist: Playlist }) {
  const texts = useTexts(section.key);
  const insets = useSafeAreaInsets();
  const screen = useCatalog(section, playlist);
  const [width, setWidth] = useState(0);
  const poster = Math.floor((width - 40 - PHONE_GAP * (PHONE_COLUMNS - 1)) / PHONE_COLUMNS);

  return (
    <View style={[styles.phone, { paddingTop: insets.top + 12 }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text weight="bold" size={30} style={[styles.title, styles.phonePad]}>{texts.title}</Text>
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
        <SearchField value={screen.query} onChangeText={screen.setQuery} placeholder={texts.search(screen.category?.name ?? '')} />
        <View style={styles.sortRow}>
          {texts.sorts.map((s) => {
            const on = s.value === screen.sort;
            return (
              <Pressable key={s.value} onPress={() => screen.setSort(s.value)} style={[styles.sortChip, on && styles.categorySelected]}>
                <Text weight={on ? 'semibold' : 'medium'} size={13} color={on ? colors.text : colors.textMuted}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {screen.items && screen.items.length === 0 ? (
        <Text size={14} color={colors.textMuted} style={[styles.phonePad, styles.empty]}>{texts.empty(screen.selected, screen.debouncedQuery)}</Text>
      ) : poster > 0 ? (
        <FlatList
          key={screen.listKey}
          data={screen.items ?? []}
          numColumns={PHONE_COLUMNS}
          keyExtractor={(m) => m.id}
          columnWrapperStyle={{ gap: PHONE_GAP }}
          contentContainerStyle={styles.phoneList}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={7}
          renderItem={({ item }) => (
            <Pressable onPress={() => screen.open(item)} accessibilityLabel={item.name}>
              {section.renderPoster(item, poster, false)}
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
  categoryFocused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
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
