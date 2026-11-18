import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { listLiveCategories, resetCategoryPrefs, saveCategoryOrder, setCategoryHidden, useLiveVersion, type LiveCategory } from '../../data/live';
import { activePlaylist, usePlaylists } from '../../data/store';
import { Button } from '../../ui/Button';
import { useI18n } from '../../ui/i18n';
import { IconButton } from '../../ui/IconButton';
import { Row, Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { colors, radius } from '../../ui/tokens';

/** Hide Live TV categories and change their order (per playlist). */
export default function LiveCategoriesScreen() {
  const { t } = useI18n();
  const playlist = activePlaylist(usePlaylists());
  const version = useLiveVersion();
  const [items, setItems] = useState<LiveCategory[] | null>(null);
  const playlistId = playlist?.id;

  useEffect(() => {
    if (!playlistId) return;
    let cancelled = false;
    void listLiveCategories(playlistId, true).then((list) => !cancelled && setItems(list));
    return () => {
      cancelled = true;
    };
  }, [playlistId, version]);

  if (!playlistId) {
    return (
      <Screen title={t('categories.title')}>
        <Text color={colors.textSoft}>{t('live.noPlaylist')}</Text>
      </Screen>
    );
  }

  const move = (index: number, delta: -1 | 1) => {
    if (!items) return;
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    setItems(next);
    void saveCategoryOrder(playlistId, next.map((c) => c.id));
  };

  return (
    <Screen title={t('categories.title')}>
      <Text size={15} color={colors.textSoft} style={styles.intro}>{t('categories.intro')}</Text>
      <Row>
        <Button variant="primary" icon="check" label={t('categories.done')} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/live'))} />
        <Button icon="refresh" label={t('categories.reset')} onPress={() => void resetCategoryPrefs(playlistId)} />
      </Row>
      {items?.map((c, i) => (
        <Row key={c.id} style={{ ...styles.item, ...(c.hidden ? styles.hiddenItem : null) }}>
          <View style={styles.name}>
            <Text weight="medium" size={15} numberOfLines={1} color={c.hidden ? colors.textFaint : colors.text}>{c.name}</Text>
            <Text size={12} color={colors.textFaint}>
              {c.hidden ? `${t('categories.hidden')} · ` : ''}{c.count}
            </Text>
          </View>
          <IconButton
            icon={c.hidden ? 'eyeOff' : 'eye'}
            label={t(c.hidden ? 'categories.show' : 'categories.hide')}
            active={!c.hidden}
            onPress={() => {
              setItems(items.map((x) => (x.id === c.id ? { ...x, hidden: !x.hidden } : x)));
              void setCategoryHidden(playlistId, c.id, !c.hidden);
            }}
          />
          <IconButton icon="up" label={t('categories.up')} disabled={i === 0} onPress={() => move(i, -1)} />
          <IconButton icon="down" label={t('categories.down')} disabled={i === items.length - 1} onPress={() => move(i, 1)} />
        </Row>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { maxWidth: 640, lineHeight: 22 },
  item: {
    maxWidth: 640,
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  hiddenItem: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  name: { flex: 1, gap: 2 },
});
