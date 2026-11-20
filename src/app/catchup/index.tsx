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
import { ChannelRow, ROW_GAP, ROW_HEIGHT } from '../../live/ChannelRow';
import { useDebounced, type CategoryItem } from '../../live/useLive';
import { Button } from '../../ui/Button';
import { Focusable } from '../../ui/Focusable';
import { useI18n } from '../../ui/i18n';
import { Icon } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';
import { SearchField } from '../../ui/SearchField';
import { Text } from '../../ui/Text';
import { colors, radius } from '../../ui/tokens';
import { useFocusSelect } from '../../ui/useFocusSelect';
import { useWideLayout } from '../../ui/useWideLayout';

/** Remembered while the app runs, so coming back opens the same list. */
let lastCategory: string | null = null;
const CATEGORY_ITEM = 52;
const PANE_DELAY_MS = 400;

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
  const [focused, setFocused] = useState<Channel | null>(null);
  const [categoryWidth, setCategoryWidth] = useState(0);
  const [channelWidth, setChannelWidth] = useState(0);
  const channels = screen.channels;
  // The pane follows the focused channel at once (so ▶ always opens the right one); only its
  // programmes wait a moment. Before anything is focused it shows the first channel.
  const paneChannel = (focused && channels?.find((c) => c.id === focused.id)) || channels?.[0] || null;

  // Remote: ▶ always goes one column on (categories → the selected channel → its replays) and
  // ◀ one column back, to the channel you were on, never past it or to the search box.
  const column = useRef<'categories' | 'channels' | 'pane' | null>(null);
  const channelList = useRef<SpatialNavigationVirtualizedListRef>(null);
  const focusChannel = () => {
    const index = channels?.findIndex((c) => c.id === paneChannel?.id) ?? -1;
    setTimeout(() => channelList.current?.focus(Math.max(0, index)), 0);
  };
  const hasChannels = screen.selected !== AIRED && !!channels?.length;
  const focusCategory = useFocusSelect(screen.selected, screen.select);

  return (
    <SpatialNavigationView direction="horizontal" style={styles.wide}>
      <View style={styles.categories}>
        <Text weight="bold" size={30} style={styles.title}>{t('nav.catchup')}</Text>
        <View style={styles.listFill} onLayout={(e) => setCategoryWidth(e.nativeEvent.layout.width)}>
          {screen.categories && categoryWidth > 0 ? (
            <SpatialNavigationVirtualizedList
              data={screen.categories}
              itemSize={CATEGORY_ITEM}
              orientation="vertical"
              scrollBehavior="stick-to-start"
              additionalItemsRendered={6}
              renderItem={({ item }: { item: CategoryItem }) => (
                <DefaultFocus enable={item.id === screen.selected}>
                  <Focusable
                    accessibilityLabel={item.name}
                    onFocus={() => {
                      if (column.current === 'pane' && hasChannels) return focusChannel();
                      column.current = 'categories';
                      focusCategory.onFocus(item.id);
                    }}
                    onBlur={() => focusCategory.onBlur(item.id)}
                    onSelect={() => screen.select(item.id)}
                    style={{ width: categoryWidth }}
                  >
                    {({ isFocused }) => <CategoryRow item={item} selected={item.id === screen.selected} focused={isFocused} />}
                  </Focusable>
                </DefaultFocus>
              )}
            />
          ) : null}
        </View>
      </View>

      {screen.selected === AIRED ? (
        <View style={styles.aired}>
          <View style={styles.head}>
            <Text weight="semibold" size={20} numberOfLines={1} style={styles.flex}>{t('catchup.recent')}</Text>
            <Text size={13} color={colors.textFaint}>{t('catchup.recentHint')}</Text>
          </View>
          <AiredList playlist={playlist} items={screen.aired} wide />
        </View>
      ) : (
        <>
          <SpatialNavigationView direction="vertical" style={styles.channels}>
            <View style={styles.head}>
              <Text weight="semibold" size={20} numberOfLines={1} style={styles.flex}>{screen.category?.name ?? ''}</Text>
              {channels ? <Text size={13} color={colors.textFaint}>{t('live.channelCount', { n: channels.length })}</Text> : null}
            </View>
            <SearchField
              value={screen.query}
              onChangeText={screen.setQuery}
              placeholder={t('live.search', { category: screen.category?.name ?? '' })}
              // Sideways into this column lands on the channel, not the search box (that's ▲).
              onFocus={() => {
                if (column.current !== 'channels' && hasChannels) return focusChannel();
                column.current = 'channels';
              }}
            />
            <View style={styles.listFill} onLayout={(e) => setChannelWidth(e.nativeEvent.layout.width)}>
              {channels === null || channelWidth === 0 ? (
                <Text size={14} color={colors.textMuted}>{t('catchup.loading')}</Text>
              ) : channels.length === 0 ? (
                <Text size={14} color={colors.textMuted} style={styles.empty}>{emptyText(t, screen.categories, screen.debouncedQuery)}</Text>
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
                        column.current = 'channels';
                        setFocused(item);
                      }}
                      onSelect={() => router.push(`/catchup/${encodeURIComponent(item.id)}`)}
                      style={{ width: channelWidth }}
                    >
                      {({ isFocused }) => <ChannelRow channel={item} playlist={playlist} focused={isFocused} active={paneChannel?.id === item.id} />}
                    </Focusable>
                  )}
                />
              )}
            </View>
          </SpatialNavigationView>

          <View style={styles.pane}>
            <View style={styles.head}>
              <Text weight="semibold" size={20} numberOfLines={1} style={styles.flex}>{paneChannel?.name ?? ''}</Text>
              {paneChannel ? <Text size={13} color={colors.textFaint}>{t('catchup.days', { n: replayDays(paneChannel) })}</Text> : null}
            </View>
            {paneChannel ? <ArchivePane key={paneChannel.id} playlist={playlist} channel={paneChannel} list={channels} wide loadDelayMs={PANE_DELAY_MS} onFocusIn={() => (column.current = 'pane')} /> : null}
          </View>
        </>
      )}
    </SpatialNavigationView>
  );
}

function CategoryRow({ item, selected, focused }: { item: CategoryItem; selected: boolean; focused: boolean }) {
  const icon = item.id === FAVORITES ? 'star' : item.id === AIRED ? 'archive' : null;
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
  wide: { flex: 1, flexDirection: 'row', gap: 28, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 24, backgroundColor: colors.bg },
  categories: { width: 270, gap: 16 },
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
  channels: { flex: 1, gap: 12, paddingTop: 8 },
  pane: { flex: 1.2, gap: 12, paddingTop: 8 },
  aired: { flex: 1, gap: 12, paddingTop: 8, maxWidth: 900 },
  head: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { lineHeight: 20, maxWidth: 420 },
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
