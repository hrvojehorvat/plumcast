import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useLockSpatialNavigation } from 'react-tv-space-navigation';
import { Focusable } from './Focusable';
import { Text } from './Text';
import { colors, font, radius } from './tokens';

type Props = Pick<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'secureTextEntry' | 'keyboardType' | 'autoComplete'> & {
  label: string;
  hint?: string;
  error?: string | null;
};

/**
 * Labelled text input. The remote moves focus to the field; OK opens the keyboard. While
 * typing, spatial navigation is locked so arrow keys move the cursor instead of the focus.
 */
export function TextField({ label, hint, error, ...input }: Props) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const [editing, setEditing] = useState(false);
  const { lock, unlock } = useLockSpatialNavigation();

  return (
    <View style={styles.wrap}>
      <Text weight="medium" size={13} color={colors.textMuted}>
        {label}
      </Text>
      <Focusable accessibilityLabel={label} onSelect={() => ref.current?.focus()}>
        {({ isFocused }) => (
          <TextInput
            ref={ref}
            {...input}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholderTextColor={colors.textFaint}
            onFocus={() => {
              setEditing(true);
              lock();
            }}
            onBlur={() => {
              setEditing(false);
              unlock();
            }}
            onSubmitEditing={() => ref.current?.blur()}
            style={[styles.input, (isFocused || editing) && styles.focused, !!error && styles.invalid]}
          />
        )}
      </Focusable>
      {error ? (
        <Text size={13} color="#ff8787">
          {error}
        </Text>
      ) : hint ? (
        <Text size={13} color={colors.textFaint} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, maxWidth: 560 },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.glass,
    color: colors.text,
    fontFamily: font.regular,
    fontSize: 16,
  },
  focused: { borderColor: colors.focusRing },
  invalid: { borderColor: '#ff8787' },
  hint: { lineHeight: 18 },
});
