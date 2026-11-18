import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Text } from './Text';
import { colors } from './tokens';

export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityLabel="Plumcast">
      <Defs>
        <LinearGradient id="plum" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.logoFrom} />
          <Stop offset="1" stopColor={colors.logoTo} />
        </LinearGradient>
      </Defs>
      <Rect width={40} height={40} rx={12} fill="url(#plum)" />
      <Path d="M15 10.5v19l15-9.5z" fill="#ffffff" />
    </Svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text weight="bold" size={size} style={{ letterSpacing: -0.5 }}>Plum</Text>
      <Text weight="bold" size={size} color={colors.accentLight} style={{ letterSpacing: -0.5 }}>cast</Text>
    </View>
  );
}
