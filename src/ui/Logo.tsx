import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Text } from './Text';
import { colors } from './tokens';

/** The app icon: a plum with a leaf and a play mark, on the dark tile. */
export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityLabel="Plumcast">
      <Defs>
        <LinearGradient id="plum" x1="0.2" y1="0.1" x2="0.8" y2="1">
          <Stop offset="0" stopColor={colors.logoFrom} />
          <Stop offset="1" stopColor={colors.logoTo} />
        </LinearGradient>
      </Defs>
      <Rect width={40} height={40} rx={12} fill={colors.logoTile} />
      <Circle cx={20} cy={22.5} r={11.5} fill="url(#plum)" />
      <Path d="M20.3 11.2c.1-1.6.6-3 1.6-4.2" fill="none" stroke={colors.logoStem} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M21.2 9.6c1.3-3.3 4.6-4.6 7.8-4-.6 3.1-3.6 5.4-7.8 4z" fill={colors.logoLeaf} />
      <Path d="M17.2 17.3v10.4l8.3-5.2z" fill="#ffffff" stroke="#ffffff" strokeWidth={1} strokeLinejoin="round" />
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
