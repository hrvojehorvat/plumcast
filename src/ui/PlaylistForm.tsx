import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MessageKey } from '../core/i18n';
import type { PlaylistKind } from '../core/models';
import { EMPTY_FORM, applyServerInput, validatePlaylistForm, type FormProblem, type PlaylistFormValues } from '../core/playlistForm';
import { BROWSER_DEV, DEV_LOGIN } from '../data/net';
import type { Playlist } from '../data/playlists';
import { playlists, usePlaylists } from '../data/store';
import { Button } from './Button';
import { errorText } from './errorText';
import { useI18n } from './i18n';
import { Icon } from './Icon';
import { pickM3uFile } from './pickM3uFile';
import { Row } from './Screen';
import { Segmented } from './Segmented';
import { SyncProgressBar } from './SyncProgressBar';
import { Text } from './Text';
import { TextField } from './TextField';
import { colors, radius } from './tokens';

const KINDS: readonly PlaylistKind[] = ['xtream', 'm3u-url', 'm3u-file'];

function initialValues(edited: Playlist | null): PlaylistFormValues {
  if (edited) return { ...EMPTY_FORM, kind: edited.kind, name: edited.name, server: edited.kind === 'xtream' ? (edited.server ?? '') : '', username: edited.username ?? '' };
  // Dev builds prefill the .env.local login so testing is one click (release builds have no DEV_LOGIN).
  if (DEV_LOGIN?.server) return { ...EMPTY_FORM, server: DEV_LOGIN.server, username: DEV_LOGIN.username, password: DEV_LOGIN.password };
  return EMPTY_FORM;
}

/** Add or edit a playlist. Saving downloads the catalog first and shows progress. */
export function PlaylistForm({ edited }: { edited: Playlist | null }) {
  const { t } = useI18n();
  const { syncing } = usePlaylists();
  const [values, setValues] = useState(() => initialValues(edited));
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = (next: Partial<PlaylistFormValues>) => {
    setValues((v) => ({ ...v, ...next }));
    setProblem(null);
    setError(null);
  };
  const problemText = (field: FormProblem) => (problem === field ? t(`problem.${field}`) : null);
  const keepHint = (key: MessageKey) => (edited && edited.kind === values.kind ? t(key) : undefined);

  async function save() {
    const result = validatePlaylistForm(values, edited);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (edited) {
        await playlists.update(edited.id, result.draft, values.file?.text ?? null, result.needsSync);
        router.navigate('/settings');
      } else {
        await playlists.add(result.draft, values.file?.text ?? null);
        router.navigate('/');
      }
    } catch (e) {
      setError(errorText(t, e));
      setSaving(false);
    }
  }

  async function pickFile() {
    try {
      const file = await pickM3uFile();
      if (file) patch({ file });
    } catch (e) {
      console.warn('Plumcast could not read the chosen file', e);
      setError(t('playlist.fileError'));
    }
  }

  const busy = saving && !!syncing;

  return (
    <>
      <Segmented
        options={KINDS.map((kind) => ({ value: kind, label: t(`playlist.kind.${kind}`) }))}
        value={values.kind}
        onChange={(kind) => patch({ kind })}
      />

      <TextField label={t('playlist.name')} placeholder={t('playlist.namePlaceholder')} value={values.name} onChangeText={(name) => patch({ name })} />

      {values.kind === 'xtream' ? (
        <>
          <TextField
            label={t('playlist.server')}
            placeholder="http://example.com:8080"
            keyboardType="url"
            value={values.server}
            onChangeText={(input) => {
              setValues((v) => applyServerInput(v, input));
              setProblem(null);
            }}
            hint={t('playlist.serverHint')}
            error={problemText('server')}
          />
          <TextField label={t('playlist.username')} autoComplete="username" value={values.username} onChangeText={(username) => patch({ username })} error={problemText('username')} />
          <TextField
            label={t('playlist.password')}
            secureTextEntry
            autoComplete="password"
            value={values.password}
            onChangeText={(password) => patch({ password })}
            hint={keepHint('playlist.passwordKeep')}
            error={problemText('password')}
          />
        </>
      ) : values.kind === 'm3u-url' ? (
        <TextField
          label={t('playlist.m3uUrl')}
          placeholder="https://…/playlist.m3u"
          keyboardType="url"
          value={values.m3uUrl}
          onChangeText={(m3uUrl) => patch({ m3uUrl })}
          hint={keepHint('playlist.m3uUrlKeep')}
          error={problemText('m3uUrl')}
        />
      ) : (
        <View style={styles.file}>
          <Row style={styles.fileRow}>
            <Button icon="file" label={t('playlist.pickFile')} onPress={pickFile} />
          </Row>
          <Text size={14} color={values.file ? colors.text : colors.textMuted}>
            {values.file?.name ?? t('playlist.noFile')}
          </Text>
          <Text size={13} color={problem === 'file' ? '#ff8787' : colors.textFaint}>
            {problem === 'file' ? t('problem.file') : t('playlist.fileHint')}
          </Text>
        </View>
      )}

      {BROWSER_DEV && values.kind !== 'm3u-file' ? (
        <Text size={13} color={colors.textFaint} style={styles.hint}>
          {t('playlist.webHint')}
        </Text>
      ) : null}

      {busy && syncing?.progress ? <SyncProgressBar progress={syncing.progress} /> : null}

      {error ? (
        <View style={styles.error}>
          <Icon name="alert" size={18} color="#ff8787" />
          <Text size={14} color="#ffc9c9" style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}

      <Row>
        {busy ? (
          <Button variant="secondary" icon="stop" label={t('sync.stop')} onPress={() => playlists.cancelSync()} />
        ) : (
          <Button variant="primary" icon="check" label={edited ? t('common.save') : t('playlist.saveAndLoad')} onPress={save} busy={saving} />
        )}
        <Button label={t('common.cancel')} onPress={() => (edited ? router.navigate('/settings') : router.navigate('/'))} disabled={busy} />
      </Row>
    </>
  );
}

const styles = StyleSheet.create({
  file: { gap: 8, maxWidth: 560 },
  fileRow: { alignSelf: 'flex-start' },
  hint: { maxWidth: 560, lineHeight: 18 },
  error: {
    maxWidth: 560,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(224,49,49,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,135,135,0.3)',
  },
  errorText: { flex: 1, lineHeight: 20 },
});
