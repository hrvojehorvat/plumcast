import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { listLiveCategories, resetCategoryPrefs, saveCategoryOrder, setCategoryHidden, type LiveCategory } from '../../data/live';
import { activePlaylist, usePlaylists } from '../../data/store';
import { Button } from '../../ui/Button';
import { useI18n } from '../../ui/i18n';
import { IconButton } from '../../ui/IconButton';
import { Row, Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { colors, radius } from '../../ui/tokens';

/**
 * Hide Live TV categories and change their order (per playlist). The list on screen is what
 * counts while editing: saving doesn't reload it (a reload rebuilt the list and the remote focus
 * jumped to the top), and saves run one after another so a later move is never overtaken.
 */
export default function LiveCategoriesScreen() {
  const { t } = useI18n();
  const playlist = activePlaylist(usePlaylists());
  const [items, setItems] = useState<LiveCategory[] | null>(null);
  // Bumped after "Reset": the only time the list is read again.
  const [loaded, setLoaded] = useState(0);
  const playlistId = playlist?.id;
  const saving = useRef<Promise<void>>(Promise.resolve());
  // The ▲ / ▼ buttons per row, so the focus can follow a moved category.
  const [upButtons] = useState(() => new Map<number, SpatialNavigationNodeRef>());
  const [downButtons] = useState(() => new Map<number, SpatialNavigationNodeRef>());

  useEffect(() => {
    if (!playlistId) return;
    let cancelled = false;
    void listLiveCategories(playlistId, true).then((list) => !cancelled && setItems(list));
    return () => {
      cancelled = true;
    };
  }, [playlistId, loaded]);

  /** Runs saves in order. */
  const save = (task: () => Promise<void>) => {
    saving.current = saving.current.then(task).catch((error: unknown) => console.warn('Category change not saved', error));
  };

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
    save(() => saveCategoryOrder(playlistId, next.map((c) => c.id)));
    // The focus goes with the category: the same button, one row up or down.
    const buttons = delta < 0 ? upButtons : downButtons;
    setTimeout(() => buttons.get(to)?.focus(), 0);
  };

  const buttonRef = (buttons: Map<number, SpatialNavigationNodeRef>, index: number) => (node: SpatialNavigationNodeRef | null) => {
    if (node) buttons.set(index, node);
    else buttons.delete(index);
  };

  return (
    <Screen title={t('categories.title')}>
      <Text size={15} color={colors.textSoft} style={styles.intro}>{t('categories.intro')}</Text>
      <Row>
        <Button variant="primary" icon="check" label={t('categories.done')} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/live'))} />
        <Button
          icon="refresh"
          label={t('categories.reset')}
          onPress={() => save(() => resetCategoryPrefs(playlistId).then(() => setLoaded((n) => n + 1)))}
        />
      </Row>
      {/* Rows are keyed by position: they stay put for the remote's focus, only their content moves. */}
      {items?.map((c, i) => (
        <Row key={i} style={{ ...styles.item, ...(c.hidden ? styles.hiddenItem : null) }}>
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
              save(() => setCategoryHidden(playlistId, c.id, !c.hidden));
            }}
          />
          <IconButton icon="up" label={t('categories.up')} disabled={i === 0} onPress={() => move(i, -1)} focusRef={buttonRef(upButtons, i)} />
          <IconButton icon="down" label={t('categories.down')} disabled={i === items.length - 1} onPress={() => move(i, 1)} focusRef={buttonRef(downButtons, i)} />
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
