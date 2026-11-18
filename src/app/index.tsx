import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { DefaultFocus } from 'react-tv-space-navigation';
import { ago, formatDate, formatNumber } from '../core/format';
import { canRefresh } from '../core/playlistForm';
import type { Playlist } from '../data/playlists';
import { activePlaylist, playlists, usePlaylists } from '../data/store';
import { Button } from '../ui/Button';
import { errorText } from '../ui/errorText';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { LogoMark, Wordmark } from '../ui/Logo';
import { Card, Row, Screen } from '../ui/Screen';
import { SyncProgressBar } from '../ui/SyncProgressBar';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';

export default function Home() {
  const { t } = useI18n();
  const state = usePlaylists();
  const active = activePlaylist(state);

  if (!state.ready) return <Screen title={t('nav.home')} />;

  if (state.storageError) {
    return (
      <Screen title={t('nav.home')}>
        <Text color="#ffc9c9">{t('home.storageError')}</Text>
        <Text size={13} color={colors.textFaint}>{state.storageError}</Text>
      </Screen>
    );
  }

  if (!active) {
    return (
      <Screen title={t('nav.home')}>
        <View style={styles.brand}>
          <LogoMark size={52} />
          <Wordmark size={28} />
        </View>
        <Text weight="semibold" size={20}>{t('home.welcomeTitle')}</Text>
        <Text size={16} color={colors.textSoft} style={styles.intro}>{t('home.welcomeText')}</Text>
        <Row>
          <DefaultFocus>
            <Button variant="primary" icon="plus" label={t('playlist.add')} onPress={() => router.navigate('/playlists/add')} />
          </DefaultFocus>
        </Row>
        <View style={styles.note}>
          <Icon name="shield" size={18} color={colors.textMuted} />
          <Text size={14} color={colors.textMuted} style={styles.noteText}>{t('home.noContent')}</Text>
        </View>
      </Screen>
    );
  }

  const others = state.list.filter((p) => p.id !== active.id);
  return (
    <Screen title={t('nav.home')}>
      <PlaylistCard playlist={active} />
      {others.length ? (
        <>
          <Text weight="semibold" size={13} color={colors.textMuted} style={styles.label}>{t('home.switch').toUpperCase()}</Text>
          <Row>
            {others.map((p) => (
              <Button key={p.id} label={p.name} onPress={() => void playlists.setActive(p.id)} />
            ))}
          </Row>
        </>
      ) : null}
    </Screen>
  );
}

/** The active playlist: account, what it contains, last update, refresh. */
function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const { t, lang } = useI18n();
  const { syncing, syncError } = usePlaylists();
  const busy = syncing?.playlistId === playlist.id;
  const error = syncError?.playlistId === playlist.id ? syncError.error : null;
  const { account, counts } = playlist;
  const when = playlist.syncedAt ? ago(playlist.syncedAt) : null;

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text weight="bold" size={22} numberOfLines={1}>{playlist.name}</Text>
          <Text size={13} color={colors.textMuted} numberOfLines={1}>
            {t(`playlist.kind.${playlist.kind}`)}
            {playlist.server ? ` · ${playlist.server.replace(/^https?:\/\//, '')}` : ''}
          </Text>
        </View>
        {account ? (
          <Text weight="semibold" size={12} color={colors.accentLighter} style={styles.pill}>
            {account.isTrial ? `${account.status} · ${t('account.trial')}` : account.status}
          </Text>
        ) : null}
      </View>

      {counts ? (
        <View style={styles.stats}>
          <Stat label={t('counts.live')} value={formatNumber(counts.live, lang)} sub={t('counts.categories', { n: counts.liveCategories })} />
          <Stat label={t('counts.movies')} value={formatNumber(counts.movies, lang)} sub={t('counts.categories', { n: counts.movieCategories })} />
          <Stat label={t('counts.series')} value={formatNumber(counts.series, lang)} sub={t('counts.categories', { n: counts.seriesCategories })} />
        </View>
      ) : null}

      {account ? (
        <View style={styles.stats}>
          <Stat label={t('account.expires')} value={account.expiresAt ? formatDate(account.expiresAt, lang) : t('account.never')} />
          <Stat label={t('account.connections')} value={`${account.activeConnections} / ${account.maxConnections || '∞'}`} />
        </View>
      ) : null}

      <Text size={13} color={colors.textMuted}>
        {when ? t('sync.updated', { when: t(when.key, { n: when.n }) }) : t('sync.never')}
      </Text>

      {busy && syncing?.progress ? <SyncProgressBar progress={syncing.progress} /> : null}
      {error ? (
        <View style={styles.error}>
          <Icon name="alert" size={18} color="#ff8787" />
          <Text size={14} color="#ffc9c9" style={styles.errorText}>{`${t('sync.failed')}: ${errorText(t, error)}`}</Text>
        </View>
      ) : null}

      <Row>
        {busy ? (
          <Button icon="stop" label={t('sync.stop')} onPress={() => playlists.cancelSync()} />
        ) : canRefresh(playlist.kind) ? (
          <Button variant="primary" icon="refresh" label={error ? t('common.retry') : t('sync.refresh')} onPress={() => void playlists.refresh(playlist.id)} />
        ) : (
          <Button variant="primary" icon="file" label={t('playlist.updateFile')} onPress={() => router.navigate(`/playlists/${playlist.id}`)} />
        )}
        <Button icon="edit" label={t('common.edit')} onPress={() => router.navigate(`/playlists/${playlist.id}`)} />
      </Row>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text size={12} color={colors.textMuted}>{label}</Text>
      <Text weight="bold" size={22}>{value}</Text>
      {sub ? <Text size={12} color={colors.textFaint}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  intro: { maxWidth: 560, lineHeight: 24 },
  label: { letterSpacing: 1, marginTop: 8 },
  note: {
    maxWidth: 560,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  noteText: { flex: 1, lineHeight: 20 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flex: 1, gap: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { minWidth: 130, flexGrow: 1, flexBasis: 130, padding: 12, gap: 2, borderRadius: radius.md, backgroundColor: colors.glass },
  error: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(224,49,49,0.12)' },
  errorText: { flex: 1, lineHeight: 20 },
});
