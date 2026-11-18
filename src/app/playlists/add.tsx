import { useI18n } from '../../ui/i18n';
import { PlaylistForm } from '../../ui/PlaylistForm';
import { Screen } from '../../ui/Screen';

export default function AddPlaylist() {
  const { t } = useI18n();
  return (
    <Screen title={t('playlist.add')}>
      <PlaylistForm edited={null} />
    </Screen>
  );
}
