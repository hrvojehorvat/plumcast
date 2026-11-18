import type { ReactElement, Ref } from 'react';
import { Platform, Pressable, type ViewStyle } from 'react-native';
import { SpatialNavigationFocusableView, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';

type Props = {
  onSelect?: () => void;
  /** Remote focus arrived / left (TV and keyboard; not fired by touch). */
  onFocus?: () => void;
  onBlur?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
  /** Grid cells: the columns this item spans (focus moving up/down picks the item at the same column). */
  indexRange?: [number, number];
  /** Lets the screen move remote focus here (`ref.current.focus()`). */
  focusRef?: Ref<SpatialNavigationNodeRef>;
  children: (state: { isFocused: boolean }) => ReactElement;
};

/** Touch phones need a press handler; TV uses the remote, and web gets clicks from the library. */
const needsPress = Platform.OS !== 'web' && !Platform.isTV;

/**
 * Anything the remote can move to. Use this instead of Pressable so D-pad focus works
 * on TV and in the browser, and taps still work on phones.
 */
export function Focusable({ onSelect, onFocus, onBlur, style, accessibilityLabel, indexRange, focusRef, children }: Props) {
  return (
    <SpatialNavigationFocusableView ref={focusRef} indexRange={indexRange} onSelect={onSelect} onFocus={onFocus} onBlur={onBlur} style={style} viewProps={{ accessibilityLabel, accessibilityRole: 'button' }}>
      {(state) =>
        needsPress ? (
          <Pressable onPress={onSelect} accessibilityLabel={accessibilityLabel}>
            {children(state)}
          </Pressable>
        ) : (
          children(state)
        )
      }
    </SpatialNavigationFocusableView>
  );
}
