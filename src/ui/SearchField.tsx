import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLockSpatialNavigation } from 'react-tv-space-navigation';
import { Focusable } from './Focusable';
import { Icon } from './Icon';
import { colors, font, radius } from './tokens';

/** Compact search box. OK starts typing; arrow keys stay in the text while typing. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  onFocus,
  onBlur,
  onSubmit,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Remote focus arrived on the box. */
  onFocus?: () => void;
  onBlur?: () => void;
  /** The keyboard's search / done key. */
  onSubmit?: () => void;
}) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const [editing, setEditing] = useState(false);
  const { lock, unlock } = useLockSpatialNavigation();

  return (
    <Focusable accessibilityLabel={placeholder} onFocus={onFocus} onBlur={onBlur} onSelect={() => ref.current?.focus()}>
      {({ isFocused }) => (
        <View style={[styles.box, (isFocused || editing) && styles.focused]}>
          <Icon name="search" size={16} color={colors.textFaint} />
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="search"
            onFocus={() => {
              setEditing(true);
              lock();
            }}
            onBlur={() => {
              setEditing(false);
              unlock();
            }}
            onSubmitEditing={() => {
              onSubmit?.();
              ref.current?.blur();
            }}
            style={styles.input}
          />
          {value ? (
            <Pressable accessibilityLabel="Clear" focusable={false} onPress={() => onChangeText('')} hitSlop={8}>
              <Icon name="close" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 38,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  focused: { borderColor: colors.focusRing },
  input: { flex: 1, minWidth: 0, height: 34, color: colors.text, fontFamily: font.regular, fontSize: 13, outlineStyle: 'none' } as object,
});
