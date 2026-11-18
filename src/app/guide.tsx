import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { activePlaylist, usePlaylists } from '../data/store';
import { PhoneGuide } from '../guide/PhoneGuide';
import { WideGuide } from '../guide/WideGuide';
import { Button } from '../ui/Button';
import { useI18n } from '../ui/i18n';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';
import { useWideLayout } from '../ui/useWideLayout';

export default function Guide() {
  const { t } = useI18n();
  const state = usePlaylists();
  const playlist = activePlaylist(state);
  const wide = useWideLayout();

  if (!state.ready) return null;
  if (!playlist) {
    return (
      <Screen title={t('nav.guide')}>
        <Text size={15} color={colors.textSoft}>{t('guide.noPlaylist')}</Text>
        <View style={styles.inlineButton}>
          <Button variant="primary" icon="plus" label={t('playlist.add')} onPress={() => router.push('/playlists/add')} />
        </View>
      </Screen>
    );
  }
  return wide ? <WideGuide playlist={playlist} /> : <PhoneGuide playlist={playlist} />;
}

const styles = StyleSheet.create({
  inlineButton: { flexDirection: 'row' },
});
