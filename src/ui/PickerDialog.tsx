import { CurrentMark } from './CurrentMark';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
type ScrollViewRef = React.ComponentRef<typeof ScrollView>;
import { useLockSpatialNavigation } from 'react-tv-space-navigation';
import { usePlayerKeys } from '../player/usePlayerKeys';
import { Text } from './Text';
import { colors, radius } from './tokens';

const ITEM = 48;
const REMOTE = Platform.OS === 'web' || Platform.isTV;

export interface PickerOption {
  id: string;
  label: string;
  detail?: string;
}

/** A list to choose one option from (▲▼ move, OK picks, Back closes). Locks the screen's remote focus while open. */
export function PickerDialog({ title, options, value, onPick, onClose }: { title: string; options: PickerOption[]; value: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const { lock, unlock } = useLockSpatialNavigation();
  const [index, setIndex] = useState(() => Math.max(0, options.findIndex((o) => o.id === value)));
  const scroll = useRef<ScrollViewRef>(null);

  useEffect(() => {
    lock();
    return () => unlock();
  }, [lock, unlock]);

  useEffect(() => {
    scroll.current?.scrollTo({ y: Math.max(0, (index - 3) * ITEM), animated: false });
  }, [index]);

  usePlayerKeys((key) => {
    if (key === 'back') onClose();
    else if (key === 'up') setIndex((i) => Math.max(0, i - 1));
    else if (key === 'down') setIndex((i) => Math.min(options.length - 1, i + 1));
    else if (key === 'channelUp') setIndex((i) => Math.max(0, i - 8));
    else if (key === 'channelDown') setIndex((i) => Math.min(options.length - 1, i + 8));
    else if (key === 'select' && options[index]) onPick(options[index].id);
  });

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.card} accessibilityViewIsModal>
        <Text size={20} weight="bold" style={styles.title}>{title}</Text>
        <ScrollView ref={scroll} style={styles.list}>
          {options.map((o, i) => {
            const selected = o.id === value;
            const on = i === index && REMOTE;
            return (
              <Pressable key={o.id} onPress={() => onPick(o.id)} onHoverIn={() => setIndex(i)} style={[styles.item, on && styles.focused]}>
                {selected && !on ? <CurrentMark /> : null}
                <Text size={15} weight={selected ? 'semibold' : 'regular'} numberOfLines={1} color={on ? colors.text : selected ? colors.accentLight : colors.textSoft} style={styles.flex}>{o.label}</Text>
                {o.detail ? <Text size={12} color={colors.textFaint}>{o.detail}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(6,4,10,0.72)' },
  card: { width: '100%', maxWidth: 460, maxHeight: '86%', padding: 20, gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  title: { letterSpacing: -0.5 },
  list: { flexGrow: 0 },
  flex: { flex: 1 },
  item: { height: ITEM - 4, marginBottom: 4, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
});
