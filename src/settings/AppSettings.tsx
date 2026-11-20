import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Lang } from '../core/i18n';
import type { StreamFormat } from '../core/streams';
import { clearGuideCache } from '../data/guide';
import { setPrefs, usePrefs } from '../data/prefs';
import { Button } from '../ui/Button';
import { useI18n } from '../ui/i18n';
import { Row } from '../ui/Screen';
import { Segmented } from '../ui/Segmented';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';

/** Language names in their own language, so anyone can find theirs. */
const LANG_NAMES: Record<Lang, string> = { en: 'English', de: 'Deutsch', hr: 'Hrvatski' };

function Label({ children }: { children: string }) {
  return <Text weight="semibold" size={13} color={colors.textMuted} style={styles.label}>{children.toUpperCase()}</Text>;
}

/** Settings → Language. */
export function LanguageSettings() {
  const { t } = useI18n();
  const { lang } = usePrefs();
  return (
    <View style={styles.section}>
      <Label>{t('settings.language')}</Label>
      <Segmented<'device' | Lang>
        options={[{ value: 'device', label: t('settings.langDevice') }, ...(Object.keys(LANG_NAMES) as Lang[]).map((l) => ({ value: l, label: LANG_NAMES[l] }))]}
        value={lang ?? 'device'}
        onChange={(v) => void setPrefs({ lang: v === 'device' ? null : v })}
      />
    </View>
  );
}

/** Settings → Playback: how Xtream live channels are requested. */
export function PlaybackSettings() {
  const { t } = useI18n();
  const { streamFormat } = usePrefs();
  return (
    <View style={styles.section}>
      <Label>{t('settings.playback')}</Label>
      <View style={styles.item}>
        <Text weight="semibold" size={16}>{t('settings.format')}</Text>
        <Text size={13} color={colors.textMuted} style={styles.hint}>{t('settings.formatHint')}</Text>
        <Segmented<StreamFormat>
          options={[
            { value: 'ts', label: 'MPEG-TS' },
            { value: 'm3u8', label: 'HLS' },
          ]}
          value={streamFormat}
          onChange={(v) => void setPrefs({ streamFormat: v })}
        />
      </View>
    </View>
  );
}

/** Settings → Storage and About. */
export function StorageAndAbout() {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const clear = async () => {
    setState('busy');
    try {
      await clearGuideCache();
      setState('done');
    } catch (error) {
      console.warn('Plumcast cache could not be cleared', error);
      setState('idle');
    }
  };
  const version = Constants.expoConfig?.version ?? '';

  return (
    <>
      <View style={styles.section}>
        <Label>{t('settings.storage')}</Label>
        <Text size={13} color={colors.textMuted} style={styles.hint}>{t('settings.clearHint')}</Text>
        <Row style={styles.center}>
          <Button icon="trash" label={t('settings.clearCache')} busy={state === 'busy'} onPress={() => void clear()} />
          {state === 'done' ? <Text size={14} color={colors.textSoft}>{t('settings.cleared')}</Text> : null}
        </Row>
      </View>
      <View style={styles.section}>
        <Label>{t('settings.about')}</Label>
        <Text weight="semibold" size={16}>{`Plumcast${version ? ` · ${t('settings.version', { v: version })}` : ''}`}</Text>
        <Text size={13} color={colors.textMuted} style={styles.hint}>{t('settings.aboutText')}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, maxWidth: 640, marginTop: 16 },
  label: { letterSpacing: 1 },
  item: { gap: 8 },
  hint: { lineHeight: 18 },
  center: { alignItems: 'center' },
});
