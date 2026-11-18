import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { usePlaylists, playlists } from '../../data/store';
import { Button } from '../../ui/Button';
import { useI18n } from '../../ui/i18n';
import { PlaylistForm } from '../../ui/PlaylistForm';
import { Row, Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { colors } from '../../ui/tokens';

export default function EditPlaylist() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, list, activeId } = usePlaylists();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const playlist = list.find((p) => String(p.id) === id) ?? null;

  if (!ready) return <Screen title={t('playlist.edit')} />;
  if (!playlist) {
    return (
      <Screen title={t('playlist.edit')}>
        <Text color={colors.textMuted}>{t('playlist.notFound')}</Text>
        <Row>
          <Button label={t('nav.settings')} onPress={() => router.navigate('/settings')} />
        </Row>
      </Screen>
    );
  }

  return (
    <Screen title={t('playlist.edit')}>
      {/* key: a fresh form when switching between playlists */}
      <PlaylistForm key={playlist.id} edited={playlist} />
      <Row>
        {playlist.id !== activeId ? <Button icon="check" label={t('playlist.use')} onPress={() => void playlists.setActive(playlist.id)} /> : null}
        <Button
          variant="danger"
          icon="trash"
          label={confirmDelete ? t('playlist.deleteConfirm') : t('playlist.delete')}
          onPress={async () => {
            if (!confirmDelete) return setConfirmDelete(true);
            await playlists.remove(playlist.id);
            router.navigate('/settings');
          }}
        />
      </Row>
    </Screen>
  );
}
