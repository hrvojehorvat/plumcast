import { StyleSheet, View } from 'react-native';
import { cancelGuideSync, syncGuide, useGuideStatus } from '../data/guide';
import { EPG_OFFSET_LIMIT, setPrefs, usePrefs } from '../data/prefs';
import type { Playlist } from '../data/playlists';
import { useGuideStatusLine } from '../guide/useGuideScreen';
import { Button } from '../ui/Button';
import { useI18n } from '../ui/i18n';
import { IconButton } from '../ui/IconButton';
import { Row } from '../ui/Screen';
import { Segmented } from '../ui/Segmented';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';

/** Settings → TV guide: time correction, clock format, and updating the active playlist's guide. */
export function GuideSettings({ playlist }: { playlist: Playlist | null }) {
  const { t } = useI18n();
  const prefs = usePrefs();
  const offset = prefs.epgOffsetHours;
  const shown = offset > 0 ? `+${offset}` : String(offset);

  return (
    <View style={styles.root}>
      <View style={styles.item}>
        <Text weight="semibold" size={16}>{t('settings.offset')}</Text>
        <Text size={13} color={colors.textMuted} style={styles.hint}>{t('settings.offsetHint')}</Text>
        <Row style={styles.stepper}>
          <IconButton icon="minus" label={t('settings.offsetLess')} disabled={offset <= -EPG_OFFSET_LIMIT} onPress={() => void setPrefs({ epgOffsetHours: offset - 1 })} />
          <Text weight="semibold" size={18} style={styles.value}>{t('settings.offsetValue', { n: shown })}</Text>
          <IconButton icon="plus" label={t('settings.offsetMore')} disabled={offset >= EPG_OFFSET_LIMIT} onPress={() => void setPrefs({ epgOffsetHours: offset + 1 })} />
        </Row>
      </View>

      <View style={styles.item}>
        <Text weight="semibold" size={16}>{t('settings.clock')}</Text>
        <Segmented
          options={[
            { value: '24', label: t('settings.clock24') },
            { value: '12', label: t('settings.clock12') },
          ]}
          value={prefs.clock24 ? '24' : '12'}
          onChange={(v) => void setPrefs({ clock24: v === '24' })}
        />
      </View>

      {playlist ? <GuideUpdate playlist={playlist} /> : null}
    </View>
  );
}

function GuideUpdate({ playlist }: { playlist: Playlist }) {
  const { t } = useI18n();
  useGuideStatus(playlist); // loads the stored status for the line below
  const line = useGuideStatusLine(playlist);
  return (
    <View style={styles.item}>
      <Text weight="semibold" size={16} numberOfLines={1}>{playlist.name}</Text>
      {line.text ? <Text size={13} color={line.problem ? '#ffc9c9' : colors.textMuted} style={styles.hint}>{line.text}</Text> : null}
      <Row>
        {line.busy ? (
          <Button icon="stop" label={t('sync.stop')} onPress={cancelGuideSync} />
        ) : (
          <Button icon="refresh" label={t('guide.update')} onPress={() => void syncGuide(playlist)} />
        )}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 20, maxWidth: 640 },
  item: { gap: 8 },
  hint: { lineHeight: 18 },
  stepper: { alignItems: 'center' },
  value: { minWidth: 64, textAlign: 'center' },
});
