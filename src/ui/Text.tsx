import { Text as RNText, type TextProps } from 'react-native';
import { colors, font, type FontWeight } from './tokens';

type Props = TextProps & { weight?: FontWeight; size?: number; color?: string };

/** Inter text. Android ignores fontWeight on custom fonts, so each weight is its own family. */
export function Text({ weight = 'regular', size = 15, color = colors.text, style, ...rest }: Props) {
  return <RNText {...rest} style={[{ fontFamily: font[weight], fontSize: size, color }, style]} />;
}
