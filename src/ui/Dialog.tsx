import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useLockSpatialNavigation } from 'react-tv-space-navigation';
import { usePlayerKeys } from '../player/usePlayerKeys';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radius } from './tokens';

/** Touch phones show no focus ring; TV and desktop (remote / keyboard) do. */
const REMOTE = Platform.OS === 'web' || Platform.isTV;

export interface DialogAction {
  label: string;
  icon?: IconName;
  primary?: boolean;
  onPress: () => void;
}

/**
 * A card above the current screen. The screen's remote focus is locked while it is open;
 * ◀ ▶ move between the actions, OK runs one, Back closes. Mouse and touch work too.
 * Drawn inside the screen (not as a route), so the screen behind keeps its state and focus.
 */
export function Dialog({ children, actions, onClose }: { children: ReactNode; actions: DialogAction[]; onClose: () => void }) {
  const { lock, unlock } = useLockSpatialNavigation();
  const [index, setIndex] = useState(() => Math.max(0, actions.findIndex((a) => a.primary)));

  useEffect(() => {
    lock();
    return () => unlock();
  }, [lock, unlock]);

  usePlayerKeys((key) => {
    if (key === 'back') onClose();
    else if (key === 'left' || key === 'up') setIndex((i) => Math.max(0, i - 1));
    else if (key === 'right' || key === 'down') setIndex((i) => Math.min(actions.length - 1, i + 1));
    else if (key === 'select') actions[index]?.onPress();
  });

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.card} accessibilityViewIsModal>
        {children}
        <View style={styles.actions}>
          {actions.map((action, i) => {
            const on = i === index;
            const fg = action.primary ? '#ffffff' : colors.text;
            return (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={action.onPress}
                onHoverIn={() => setIndex(i)}
                style={[styles.button, action.primary ? styles.primary : styles.secondary, on && REMOTE && styles.focused]}
              >
                {action.icon ? <Icon name={action.icon} size={18} color={fg} /> : null}
                <Text weight="semibold" size={15} color={fg}>{action.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(6,4,10,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 620,
    padding: 28,
    gap: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgRaised,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  button: {
    height: 46,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.glassStrong },
  focused: { borderColor: colors.focusRing },
});
