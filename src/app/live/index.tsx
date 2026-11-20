import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultFocus, SpatialNavigationView, SpatialNavigationVirtualizedList, type SpatialNavigationVirtualizedListRef } from 'react-tv-space-navigation';
import { FAVORITES, RECENT, type Channel } from '../../data/live';
import type { Playlist } from '../../data/playlists';
import { activePlaylist, usePlaylists } from '../../data/store';
import { CATEGORY_ITEM, CategoryRow } from '../../live/CategoryRow';
import { ChannelRow, ROW_GAP, ROW_HEIGHT } from '../../live/ChannelRow';
import { PreviewPane } from '../../live/PreviewPane';
import { defaultCategory, useChannels, useDebounced, useLiveCategories, type CategoryItem } from '../../live/useLive';
import { livePlayer, useLiveSession } from '../../player/store';
import { Button } from '../../ui/Button';
import { Focusable } from '../../ui/Focusable';
import { useI18n } from '../../ui/i18n';
import { Icon } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';
import { SearchField } from '../../ui/SearchField';
import { Text } from '../../ui/Text';
import { colors, radius, tv } from '../../ui/tokens';
import { useColumnEntry } from '../../ui/useColumnEntry';
import { useWideLayout } from '../../ui/useWideLayout';

/** Remembered while the app runs, so coming back to Live TV opens the same list. */
let lastCategory: string | null = null;

export default function LiveScreen() {
  const { t } = useI18n();
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  const wide = useWideLayout();

  if (!state.ready) return null;
  if (!playlist) {
    return (
      <Screen title={t('nav.live')}>
        <Text size={15} color={colors.textSoft}>{t('live.noPlaylist')}</Text>
        <View style={styles.inlineButton}>
          <Button variant="primary" icon="plus" label={t('playlist.add')} onPress={() => router.push('/playlists/add')} />
        </View>
      </Screen>
    );
  }
  return wide ? <WideLive playlist={playlist} /> : <PhoneLive playlist={playlist} />;
}

/** Shared state: selected list, search text, channels. */
function useLiveScreen(playlist: Playlist) {
  const categories = useLiveCategories(playlist);
  const [chosen, setChosen] = useState<string | null>(lastCategory);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);
  // The chosen list, or a sensible default when nothing (or a since-removed category) is chosen.
  const selected = categories ? (chosen && categories.some((c) => c.id === chosen) ? chosen : defaultCategory(categories)) : null;

  const select = (id: string) => {
    lastCategory = id;
    setChosen(id);
    setQuery('');
  };
  const channels = useChannels(playlist, selected, debouncedQuery);
  const category = categories?.find((c) => c.id === selected) ?? null;
  const open = (channel: Channel) => livePlayer.open(playlist.id, channels ?? [channel], channel);
  return { categories, selected, select, query, setQuery, debouncedQuery, channels, category, open };
}

function emptyText(t: ReturnType<typeof useI18n>['t'], selected: string | null, query: string): string {
  if (query.trim()) return t('live.noResults', { query: query.trim() });
  if (selected === FAVORITES) return t('live.noFavorites');
  if (selected === RECENT) return t('live.noRecent');
  return t('live.noChannels');
}

// ---------------------------------------------------------------- TV / desktop

/**
 * Three columns: categories, channels, preview. Moving only moves the focus (the pane shows what is on);
 * OK opens a category, OK on a channel plays it in the preview, OK on the playing channel goes full screen.
 */
function WideLive({ playlist }: { playlist: Playlist }) {
  const { t } = useI18n();
  const live = useLiveScreen(playlist);
  const session = useLiveSession();
  const [focused, setFocused] = useState<Channel | null>(null);
  const [preview, setPreview] = useState<Channel | null>(null);
  // Virtualized items sit in absolute wrappers, so they need a real width, not '100%'.
  const [categoryWidth, setCategoryWidth] = useState(0);
  const [channelWidth, setChannelWidth] = useState(0);

  const choose = (channel: Channel) => {
    if (preview?.id === channel.id) live.open(channel);
    else setPreview(channel);
  };
  const shown = preview ?? focused;

  // Coming into a column sideways lands on the selected category / the channel you were on, not on
  // the first category or the search box above the channels (▲ from the list still reaches it).
  const categoryList = useRef<SpatialNavigationVirtualizedListRef>(null);
  const categoryEntry = useColumnEntry(() => {
    const index = live.categories?.findIndex((c) => c.id === live.selected) ?? -1;
    if (index >= 0) categoryList.current?.focus(index);
  });
  const channelList = useRef<SpatialNavigationVirtualizedListRef>(null);
  const lastChannel = useRef<string | null>(null);
  const channelEntry = useColumnEntry(() => {
    if (!live.channels?.length) return;
    channelList.current?.focus(Math.max(0, live.channels.findIndex((c) => c.id === lastChannel.current)));
  });

  return (
    <SpatialNavigationView direction="horizontal" style={styles.wide}>
      {/* Categories */}
      <SpatialNavigationView direction="vertical" style={styles.categories}>
        <Text weight="bold" size={tv.title} style={styles.title}>{t('nav.live')}</Text>
        {/* Always mounted, so the list keeps its place before the button for the remote. */}
        <SpatialNavigationView direction="vertical" style={styles.listFill}>
          <View style={styles.flex} onLayout={(e) => setCategoryWidth(e.nativeEvent.layout.width)}>
            {live.categories && categoryWidth > 0 ? (
              <SpatialNavigationVirtualizedList
                ref={categoryList}
                data={live.categories}
                itemSize={CATEGORY_ITEM}
                orientation="vertical"
                scrollBehavior="stick-to-start"
                additionalItemsRendered={6}
                renderItem={({ item }: { item: CategoryItem }) => (
                  <DefaultFocus enable={item.id === live.selected}>
                    <Focusable
                      accessibilityLabel={item.name}
                      onFocus={() => categoryEntry.focus(item.id === live.selected)}
                      onBlur={categoryEntry.blur}
                      onSelect={() => live.select(item.id)}
                      style={{ width: categoryWidth }}
                    >
                      {({ isFocused }) => <CategoryRow name={item.name} count={item.count} icon={categoryIcon(item.id)} selected={item.id === live.selected} focused={isFocused} />}
                    </Focusable>
                  </DefaultFocus>
                )}
              />
            ) : null}
          </View>
        </SpatialNavigationView>
        <View style={styles.editButton}>
          <Button compact icon="edit" label={t('live.editCategories')} onPress={() => router.push('/live/categories')} onFocus={() => categoryEntry.focus()} onBlur={categoryEntry.blur} />
        </View>
      </SpatialNavigationView>

      {/* Channels */}
      <SpatialNavigationView direction="vertical" style={styles.channels}>
        <View style={styles.channelsHead}>
          <Text weight="semibold" size={tv.heading} numberOfLines={1} style={styles.flex}>{live.category?.name ?? ''}</Text>
          {live.channels ? <Text size={11} color={colors.textFaint}>{live.channels.length}</Text> : null}
        </View>
        <SearchField
          value={live.query}
          onChangeText={live.setQuery}
          placeholder={t('live.search', { category: live.category?.name ?? '' })}
          onFocus={() => channelEntry.focus()}
          onBlur={channelEntry.blur}
        />
        <View style={styles.listFill} onLayout={(e) => setChannelWidth(e.nativeEvent.layout.width)}>
          {live.channels === null || channelWidth === 0 ? (
            <Text size={13} color={colors.textMuted}>{t('live.loading')}</Text>
          ) : live.channels.length === 0 ? (
            <Text size={13} color={colors.textMuted} style={styles.empty}>{emptyText(t, live.selected, live.debouncedQuery)}</Text>
          ) : (
            <SpatialNavigationVirtualizedList
              ref={channelList}
              key={`${live.selected}|${live.debouncedQuery}`}
              data={live.channels}
              itemSize={ROW_HEIGHT + ROW_GAP}
              orientation="vertical"
              scrollBehavior="stick-to-start"
              additionalItemsRendered={4}
              renderItem={({ item }: { item: Channel }) => (
                <Focusable accessibilityLabel={item.name} onSelect={() => choose(item)} onFocus={() => {
                    lastChannel.current = item.id;
                    channelEntry.focus(true);
                    setFocused(item);
                  }}
                  onBlur={channelEntry.blur}
                  style={{ width: channelWidth }}
                >
                  {({ isFocused }) => <ChannelRow channel={item} playlist={playlist} focused={isFocused} active={preview?.id === item.id} />}
                </Focusable>
              )}
            />
          )}
        </View>
      </SpatialNavigationView>

      {/* Preview */}
      <PreviewPane playlist={playlist} channel={shown} playing={!session && preview !== null && shown?.id === preview.id} />
    </SpatialNavigationView>
  );
}

function categoryIcon(id: string) {
  return id === FAVORITES ? 'star' : id === RECENT ? 'catchup' : null;
}

// ---------------------------------------------------------------- phone

function PhoneLive({ playlist }: { playlist: Playlist }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const live = useLiveScreen(playlist);

  return (
    <View style={[styles.phone, { paddingTop: insets.top + 12 }]}>
      <View style={styles.phoneHead}>
        <Text weight="bold" size={30} style={[styles.title, styles.flex]}>{t('nav.live')}</Text>
        <Pressable accessibilityLabel={t('live.editCategories')} onPress={() => router.push('/live/categories')} hitSlop={10}>
          <Icon name="edit" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {live.categories?.map((c) => {
          const on = c.id === live.selected;
          return (
            <Pressable key={c.id} onPress={() => live.select(c.id)} style={[styles.chip, on && styles.chipOn]}>
              <Text weight={on ? 'semibold' : 'medium'} size={14} color={on ? colors.text : colors.textSoft}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.phoneSearch}>
        <SearchField value={live.query} onChangeText={live.setQuery} placeholder={t('live.search', { category: live.category?.name ?? '' })} />
      </View>
      {live.channels && live.channels.length === 0 ? (
        <Text size={14} color={colors.textMuted} style={styles.phoneEmpty}>{emptyText(t, live.selected, live.debouncedQuery)}</Text>
      ) : (
        <FlatList
          data={live.channels ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.phoneList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => live.open(item)} accessibilityLabel={item.name}>
              <ChannelRow channel={item} playlist={playlist} focused={false} />
            </Pressable>
          )}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT + ROW_GAP, offset: (ROW_HEIGHT + ROW_GAP) * index, index })}
          ItemSeparatorComponent={() => <View style={{ height: ROW_GAP }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { letterSpacing: -1 },
  inlineButton: { flexDirection: 'row' },
  wide: { flex: 1, flexDirection: 'row', gap: tv.gap, paddingHorizontal: tv.padX, paddingTop: tv.padTop, paddingBottom: tv.padBottom, backgroundColor: colors.bg },
  categories: { width: tv.side, gap: 10 },
  listFill: { flex: 1, minHeight: 0, overflow: 'hidden' },
  editButton: { paddingTop: 8, flexDirection: 'row' },
  channels: { flex: 1, minWidth: 0, gap: 8, paddingTop: 2 },
  channelsHead: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { lineHeight: 20, maxWidth: 420 },
  phone: { flex: 1, backgroundColor: colors.bg },
  phoneHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  chipsScroll: { flexGrow: 0, flexShrink: 0, marginTop: 12 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: { height: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.glassStrong },
  chipOn: { backgroundColor: colors.accent },
  phoneSearch: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  phoneEmpty: { paddingHorizontal: 20, lineHeight: 20 },
  phoneList: { paddingHorizontal: 20, paddingBottom: 24 },
});
