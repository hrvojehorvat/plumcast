import { StyleSheet, View } from 'react-native';
import { Focusable } from './Focusable';
import { Icon, type IconName } from './Icon';
import { colors, radius } from './tokens';

/** Round icon-only button (remote, mouse and touch). */
export function IconButton({ icon, label, onPress, disabled, active }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Focusable accessibilityLabel={label} onSelect={disabled ? undefined : onPress}>
      {({ isFocused }) => (
        <View style={[styles.button, active && styles.active, isFocused && styles.focused, disabled && styles.disabled]}>
          <Icon name={icon} size={18} color={active ? colors.accentLight : colors.text} />
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glassStrong,
  },
  active: { backgroundColor: colors.accentSoft },
  focused: { borderColor: colors.focusRing },
  disabled: { opacity: 0.35 },
});
