import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultFocus, SpatialNavigationView, SpatialNavigationVirtualizedList, type SpatialNavigationVirtualizedListRef } from 'react-tv-space-navigation';
import { AiredList, ArchivePane } from '../../catchup/ArchivePane';
import { replayDays } from '../../core/catchup';
import { AIRED, useArchiveCategories, useArchiveChannels } from '../../catchup/useCatchup';
import { useRecentlyAired } from '../../data/catchup';
import { ALL, FAVORITES, type Channel } from '../../data/live';
import type { Playlist } from '../../data/playlists';
import { activePlaylist, usePlaylists } from '../../data/store';
import { CATEGORY_ITEM, CategoryRow } from '../../live/CategoryRow';
import { ChannelRow, ROW_GAP, ROW_HEIGHT } from '../../live/ChannelRow';
import { useDebounced, type CategoryItem } from '../../live/useLive';
import { Button } from '../../ui/Button';
import { Focusable } from '../../ui/Focusable';
import { useI18n } from '../../ui/i18n';
import type { IconName } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';
import { SearchField } from '../../ui/SearchField';
import { Text } from '../../ui/Text';
import { colors, radius, tv } from '../../ui/tokens';
import { useColumnEntry } from '../../ui/useColumnEntry';
import { useWideLayout } from '../../ui/useWideLayout';

/** Remembered while the app runs, so coming back opens the same list. */
let lastCategory: string | null = null;

export default function CatchupScreen() {
  const { t } = useI18n();
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  const wide = useWideLayout();

  if (!state.ready) return null;
  if (!playlist) {
    return (
      <Screen title={t('nav.catchup')}>
        <Text size={15} color={colors.textSoft}>{t('live.noPlaylist')}</Text>
        <View style={styles.inlineButton}>
          <Button variant="primary" icon="plus" label={t('playlist.add')} onPress={() => router.push('/playlists/add')} />
        </View>
      </Screen>
    );
  }
  return wide ? <WideCatchup playlist={playlist} /> : <PhoneCatchup playlist={playlist} />;
}

function useCatchupScreen(playlist: Playlist) {
  const categories = useArchiveCategories(playlist);
  const [chosen, setChosen] = useState<string | null>(lastCategory);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);
  const selected = categories ? (chosen && categories.some((c) => c.id === chosen) ? chosen : AIRED) : null;
  const select = (id: string) => {
    lastCategory = id;
    setChosen(id);
    setQuery('');
  };
  const channels = useArchiveChannels(playlist, selected, debouncedQuery);
  const aired = useRecentlyAired(playlist, selected === AIRED ? ALL : null);
  const category = categories?.find((c) => c.id === selected) ?? null;
  return { categories, selected, select, query, setQuery, debouncedQuery, channels, aired, category };
}

function emptyText(t: ReturnType<typeof useI18n>['t'], categories: CategoryItem[] | null, query: string): string {
  if (query.trim()) return t('live.noResults', { query: query.trim() });
  if (categories && categories.every((c) => c.id === AIRED || !c.count)) return t('catchup.noChannels');
  return t('catchup.noChannelsHere');
}

// ---------------------------------------------------------------- TV / desktop

function WideCatchup({ playlist }: { playlist: Playlist }) {
  const { t } = useI18n();
  const screen = useCatchupScreen(playlist);
  const [picked, setPicked] = useState<Channel | null>(null);
  const [categoryWidth, setCategoryWidth] = useState(0);
  const [channelWidth, setChannelWidth] = useState(0);
  const channels = screen.channels;
  // Moving through the list opens nothing: OK picks the channel whose replays the pane shows,
  // OK again opens that channel's replays full screen.
  const paneChannel = (picked && channels?.find((c) => c.id === picked.id)) || null;
  const pick = (channel: Channel) => {
    if (paneChannel?.id === channel.id) router.push(`/catchup/${encodeURIComponent(channel.id)}`);
    else setPicked(channel);
  };

  // Every column is its own always-mounted navigation node, so ◀ / ▶ always go one column back / on.
  // Coming in sideways lands on the selected category / the channel you were on, not on the first
  // category or the search box above the channels (▲ from the list still reaches it).
  const categoryList = useRef<SpatialNavigationVirtualizedListRef>(null);
  const categoryEntry = useColumnEntry(() => {
    const index = screen.categories?.findIndex((c) => c.id === screen.selected) ?? -1;
    if (index >= 0) categoryList.current?.focus(index);
  });
  const lastChannel = useRef<string | null>(null);
  const channelList = useRef<SpatialNavigationVirtualizedListRef>(null);
  const channelEntry = useColumnEntry(() => {
    if (!channels?.length) return;
    channelList.current?.focus(Math.max(0, channels.findIndex((c) => c.id === lastChannel.current)));
  });
  const hasChannels = screen.selected !== AIRED && !!channels?.length;

  return (
    <SpatialNavigationView direction="horizontal" style={styles.wide}>
      <SpatialNavigationView direction="vertical" style={styles.categories}>
        <Text weight="bold" size={tv.title} style={styles.title}>{t('nav.catchup')}</Text>
        <View style={styles.listFill} onLayout={(e) => setCategoryWidth(e.nativeEvent.layout.width)}>
          {screen.categories && categoryWidth > 0 ? (
            <SpatialNavigationVirtualizedList
              ref={categoryList}
              data={screen.categories}
              itemSize={CATEGORY_ITEM}
              orientation="vertical"
              scrollBehavior="stick-to-start"
              additionalItemsRendered={6}
              renderItem={({ item }: { item: CategoryItem }) => (
                <DefaultFocus enable={item.id === screen.selected}>
                  <Focusable
                    accessibilityLabel={item.name}
                    onFocus={() => categoryEntry.focus(item.id === screen.selected)}
                    onBlur={categoryEntry.blur}
                    onSelect={() => screen.select(item.id)}
                    style={{ width: categoryWidth }}
                  >
                    {({ isFocused }) => <CategoryRow name={item.name} count={item.count} icon={categoryIcon(item.id)} selected={item.id === screen.selected} focused={isFocused} />}
                  </Focusable>
                </DefaultFocus>
              )}
            />
          ) : null}
        </View>
      </SpatialNavigationView>

      {screen.selected === AIRED ? (
        <SpatialNavigationView direction="vertical" style={styles.aired}>
          <View style={styles.head}>
            <Text weight="semibold" size={tv.heading} numberOfLines={1} style={styles.flex}>{t('catchup.recent')}</Text>
            <Text size={11} color={colors.textFaint} numberOfLines={1}>{t('catchup.recentHint')}</Text>
          </View>
          <AiredList playlist={playlist} items={screen.aired} wide />
        </SpatialNavigationView>
      ) : (
        <>
          <SpatialNavigationView direction="vertical" style={styles.channels}>
            <View style={styles.head}>
              <Text weight="semibold" size={tv.heading} numberOfLines={1} style={styles.flex}>{screen.category?.name ?? ''}</Text>
              {channels ? <Text size={11} color={colors.textFaint}>{channels.length}</Text> : null}
            </View>
            <SearchField
              value={screen.query}
              onChangeText={screen.setQuery}
              placeholder={t('live.search', { category: screen.category?.name ?? '' })}
              onFocus={() => channelEntry.focus()}
              onBlur={channelEntry.blur}
            />
            <View style={styles.listFill} onLayout={(e) => setChannelWidth(e.nativeEvent.layout.width)}>
              {channels === null || channelWidth === 0 ? (
                <Text size={13} color={colors.textMuted}>{t('catchup.loading')}</Text>
              ) : channels.length === 0 ? (
                <Text size={13} color={colors.textMuted} style={styles.empty}>{emptyText(t, screen.categories, screen.debouncedQuery)}</Text>
              ) : (
                <SpatialNavigationVirtualizedList
                  ref={channelList}
                  key={`${screen.selected}|${screen.debouncedQuery}`}
                  data={channels}
                  itemSize={ROW_HEIGHT + ROW_GAP}
                  orientation="vertical"
                  scrollBehavior="stick-to-start"
                  additionalItemsRendered={4}
                  renderItem={({ item }: { item: Channel }) => (
                    <Focusable
                      accessibilityLabel={item.name}
                      onFocus={() => {
                        lastChannel.current = item.id;
                        channelEntry.focus(true);
                      }}
                      onBlur={channelEntry.blur}
                      onSelect={() => pick(item)}
                      style={{ width: channelWidth }}
                    >
                      {({ isFocused }) => <ChannelRow channel={item} playlist={playlist} focused={isFocused} active={paneChannel?.id === item.id} />}
                    </Focusable>
                  )}
                />
              )}
            </View>
          </SpatialNavigationView>

          <SpatialNavigationView direction="vertical" style={styles.pane}>
            <View style={styles.head}>
              <Text weight="semibold" size={tv.heading} numberOfLines={1} style={styles.flex}>{paneChannel?.name ?? ''}</Text>
              {paneChannel ? <Text size={11} color={colors.textFaint}>{t('catchup.days', { n: replayDays(paneChannel) })}</Text> : null}
            </View>
            {paneChannel ? (
              <ArchivePane key={paneChannel.id} playlist={playlist} channel={paneChannel} list={channels} wide />
            ) : hasChannels ? (
              <Text size={13} color={colors.textMuted} style={styles.empty}>{t('catchup.pickChannel')}</Text>
            ) : null}
          </SpatialNavigationView>
        </>
      )}
    </SpatialNavigationView>
  );
}

function categoryIcon(id: string): IconName | null {
  return id === FAVORITES ? 'star' : id === AIRED ? 'archive' : null;
}

// ---------------------------------------------------------------- phone

function PhoneCatchup({ playlist }: { playlist: Playlist }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const screen = useCatchupScreen(playlist);

  return (
    <View style={[styles.phone, { paddingTop: insets.top + 12 }]}>
      <Text weight="bold" size={30} style={[styles.title, styles.phonePad]}>{t('nav.catchup')}</Text>
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
      {screen.selected === AIRED ? (
        <View style={[styles.flex, styles.phoneTop]}>
          <AiredList playlist={playlist} items={screen.aired} wide={false} />
        </View>
      ) : (
        <>
          <View style={styles.phoneSearch}>
            <SearchField value={screen.query} onChangeText={screen.setQuery} placeholder={t('live.search', { category: screen.category?.name ?? '' })} />
          </View>
          {screen.channels && screen.channels.length === 0 ? (
            <Text size={14} color={colors.textMuted} style={styles.phoneEmpty}>{emptyText(t, screen.categories, screen.debouncedQuery)}</Text>
          ) : (
            <FlatList
              data={screen.channels ?? []}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.phoneList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable onPress={() => router.push(`/catchup/${encodeURIComponent(item.id)}`)} accessibilityLabel={item.name}>
                  <ChannelRow channel={item} playlist={playlist} focused={false} />
                </Pressable>
              )}
              getItemLayout={(_, index) => ({ length: ROW_HEIGHT + ROW_GAP, offset: (ROW_HEIGHT + ROW_GAP) * index, index })}
              ItemSeparatorComponent={() => <View style={{ height: ROW_GAP }} />}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  title: { letterSpacing: -1 },
  inlineButton: { flexDirection: 'row' },
  wide: { flex: 1, flexDirection: 'row', gap: tv.gap, paddingHorizontal: tv.padX, paddingTop: tv.padTop, paddingBottom: tv.padBottom, backgroundColor: colors.bg },
  categories: { width: tv.side, gap: 10 },
  listFill: { flex: 1, minHeight: 0, overflow: 'hidden' },
  channels: { flex: 1, minWidth: 0, gap: 8, paddingTop: 2 },
  pane: { flex: 1.2, minWidth: 0, gap: 8, paddingTop: 2 },
  aired: { flex: 1, minWidth: 0, gap: 8, paddingTop: 2, maxWidth: 760 },
  head: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 10 },
  empty: { lineHeight: 18, maxWidth: 360 },
  phone: { flex: 1, backgroundColor: colors.bg },
  phonePad: { paddingHorizontal: 20 },
  phoneTop: { paddingTop: 4 },
  chipsScroll: { flexGrow: 0, flexShrink: 0, marginTop: 12 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: { height: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.glassStrong },
  chipOn: { backgroundColor: colors.accent },
  phoneSearch: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  phoneEmpty: { paddingHorizontal: 20, lineHeight: 20 },
  phoneList: { paddingHorizontal: 20, paddingBottom: 24 },
});
