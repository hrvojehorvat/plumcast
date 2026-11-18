import type { ReactElement } from 'react';
import { Platform, Pressable, type ViewStyle } from 'react-native';
import { SpatialNavigationFocusableView } from 'react-tv-space-navigation';

type Props = {
  onSelect?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
  children: (state: { isFocused: boolean }) => ReactElement;
};

/** Touch phones need a press handler; TV uses the remote, and web gets clicks from the library. */
const needsPress = Platform.OS !== 'web' && !Platform.isTV;

/**
 * Anything the remote can move to. Use this instead of Pressable so D-pad focus works
 * on TV and in the browser, and taps still work on phones.
 */
export function Focusable({ onSelect, style, accessibilityLabel, children }: Props) {
  return (
    <SpatialNavigationFocusableView onSelect={onSelect} style={style} viewProps={{ accessibilityLabel, accessibilityRole: 'button' }}>
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
