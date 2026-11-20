import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DefaultFocus } from 'react-tv-space-navigation';
import { POSTER_TEXT } from '../catalog/Poster';
import { isSearchable } from '../core/search';
import type { AiredItem } from '../data/live';
import type { Playlist } from '../data/playlists';
import { recentSearches, useRecentSearches } from '../data/searches';
import { activePlaylist, usePlaylists } from '../data/store';
import { ProgrammeDialog } from '../guide/ProgrammeDialog';
import { ChannelTile, tileHeight } from '../live/ChannelTile';
import { useDebounced } from '../live/useLive';
import { MoviePoster } from '../movies/Poster';
import { livePlayer } from '../player/store';
import { ProgrammeTile, PROGRAMME_TILE } from '../search/ProgrammeTile';
import { isEmpty, useFullSearch, type SearchResults } from '../search/useSearch';
import { SeriesPoster } from '../series/SeriesPoster';
import { Button } from '../ui/Button';
import { useI18n } from '../ui/i18n';
import { Row, Screen } from '../ui/Screen';
import { SearchField } from '../ui/SearchField';
import { Shelf } from '../ui/Shelf';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';
import { useWideLayout } from '../ui/useWideLayout';

export default function Search() {
  const { t } = useI18n();
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  if (!state.ready) return null;
  if (!playlist) {
    return (
      <Screen title={t('nav.search')}>
        <Text size={15} color={colors.textSoft}>{t('search.noPlaylist')}</Text>
        <Row>
          <Button variant="primary" icon="plus" label={t('playlist.add')} onPress={() => router.push('/playlists/add')} />
        </Row>
      </Screen>
    );
  }
  return <FullSearch playlist={playlist} />;
}

/** Remembered while the app runs, so coming back from a movie shows the same results. */
let lastQuery = '';

/** One search across channels, movies, series and the TV guide, one row per type. */
function FullSearch({ playlist }: { playlist: Playlist }) {
  const { t } = useI18n();
  const wide = useWideLayout();
  const [query, setQueryState] = useState(lastQuery);
  const setQuery = (q: string) => {
    lastQuery = q;
    setQueryState(q);
  };
  const debounced = useDebounced(query, 300);
  const found = useFullSearch(playlist, debounced);
  const recent = useRecentSearches();
  const [detail, setDetail] = useState<AiredItem | null>(null);

  // While the next results load, keep showing the previous ones (no flashing empty rows).
  const [kept, setKept] = useState<SearchResults | undefined>(undefined);
  if (found && found !== kept) setKept(found);
  const searching = isSearchable(query);
  const results = searching ? (found ?? kept) : undefined;
  const busy = searching && (debounced !== query || !found);

  const remember = () => void recentSearches.add(query);
  const poster = wide ? 150 : 112;
  const posterHeight = Math.round(poster * 1.5) + POSTER_TEXT;
  const tile = wide ? 220 : 168;
  const programmeWidth = wide ? 280 : 230;

  return (
    <Screen title={t('nav.search')}>
      <View style={styles.field}>
        <DefaultFocus>
          <SearchField value={query} onChangeText={setQuery} placeholder={t('search.placeholder')} onSubmit={remember} />
        </DefaultFocus>
      </View>

      {!searching ? (
        <>
          <Text size={14} color={colors.textMuted} style={styles.hint}>{t('search.hint')}</Text>
          {recent.length ? (
            <>
              <Text weight="semibold" size={13} color={colors.textMuted} style={styles.label}>{t('search.recent').toUpperCase()}</Text>
              <Row>
                {recent.map((q) => (
                  <Button key={q} icon="search" label={q} onPress={() => setQuery(q)} />
                ))}
                <Button icon="close" label={t('search.clear')} onPress={() => void recentSearches.clear()} />
              </Row>
            </>
          ) : null}
        </>
      ) : !results ? (
        <Text size={14} color={colors.textMuted}>{t('search.searching')}</Text>
      ) : isEmpty(results) ? (
        <Text size={15} color={colors.textSoft}>{busy ? t('search.searching') : t('search.none', { q: query.trim() })}</Text>
      ) : (
        <>
          {results.channels.length ? (
            <Shelf
              title={t('search.channels')}
              note={String(results.channels.length)}
              items={results.channels}
              height={tileHeight(tile)}
              keyOf={(c) => c.id}
              labelOf={(c) => c.name}
              onSelect={(c) => {
                remember();
                livePlayer.open(playlist.id, results.channels, c);
              }}
            >
              {(c, focused) => <ChannelTile channel={c} playlist={playlist} width={tile} focused={focused} />}
            </Shelf>
          ) : null}
          {results.movies.length ? (
            <Shelf
              title={t('nav.movies')}
              note={String(results.movies.length)}
              items={results.movies}
              height={posterHeight}
              keyOf={(m) => m.id}
              labelOf={(m) => m.name}
              onSelect={(m) => {
                remember();
                router.push(`/movies/${encodeURIComponent(m.id)}`);
              }}
            >
              {(m, focused) => <MoviePoster movie={m} width={poster} focused={focused} />}
            </Shelf>
          ) : null}
          {results.series.length ? (
            <Shelf
              title={t('nav.series')}
              note={String(results.series.length)}
              items={results.series}
              height={posterHeight}
              keyOf={(s) => s.id}
              labelOf={(s) => s.name}
              onSelect={(s) => {
                remember();
                router.push(`/series/${encodeURIComponent(s.id)}`);
              }}
            >
              {(s, focused) => <SeriesPoster series={s} width={poster} focused={focused} />}
            </Shelf>
          ) : null}
          {results.programmes.length ? (
            <Shelf
              title={t('search.programmes')}
              note={String(results.programmes.length)}
              items={results.programmes}
              height={PROGRAMME_TILE}
              keyOf={(p) => `${p.channel.id}:${p.programme.start}`}
              labelOf={(p) => p.programme.title}
              onSelect={(p) => {
                remember();
                setDetail(p);
              }}
            >
              {(p, focused) => <ProgrammeTile item={p} width={programmeWidth} focused={focused} />}
            </Shelf>
          ) : null}
        </>
      )}

      {detail ? (
        <ProgrammeDialog
          channel={detail.channel}
          programme={detail.programme}
          onWatch={() => {
            setDetail(null);
            livePlayer.open(playlist.id, [detail.channel], detail.channel);
          }}
          onReplay={() => {
            setDetail(null);
            livePlayer.openReplay(playlist.id, [detail.channel], detail.channel, detail.programme);
          }}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { maxWidth: 640 },
  hint: { maxWidth: 560, lineHeight: 20 },
  label: { letterSpacing: 1, marginTop: 8 },
});
