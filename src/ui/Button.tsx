import type { Ref } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { Focusable } from './Focusable';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radius } from './tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  /** Lets the screen move remote focus here. */
  focusRef?: Ref<SpatialNavigationNodeRef>;
  /** Smaller, for the narrow TV side columns. */
  compact?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

/** Focusable pill button (remote, mouse and touch). */
export function Button({ label, onPress, variant = 'secondary', icon, disabled, busy, focusRef, compact, onFocus, onBlur }: Props) {
  const inactive = disabled || busy;
  const fg = variant === 'primary' ? '#ffffff' : variant === 'danger' ? '#ff8787' : colors.text;
  return (
    <Focusable accessibilityLabel={label} onSelect={inactive ? undefined : onPress} focusRef={focusRef} onFocus={onFocus} onBlur={onBlur}>
      {({ isFocused }) => (
        <View style={[styles.base, compact && styles.compact, styles[variant], isFocused && styles.focused, inactive && styles.inactive]}>
          {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={compact ? 15 : 18} color={fg} /> : null}
          <Text weight="semibold" size={compact ? 13 : 15} color={fg}>
            {label}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  compact: { height: 36, paddingHorizontal: 14, gap: 6 },
  base: {
    height: 46,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.glassStrong },
  danger: { backgroundColor: 'rgba(224,49,49,0.15)' },
  focused: { borderColor: colors.focusRing },
  inactive: { opacity: 0.5 },
});
