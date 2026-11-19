import Svg, { Path } from 'react-native-svg';

/** Stroke icons from the mockups (24×24 viewBox). */
export const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  live: 'M3 7h18v13H3zM8 2l4 5 4-5',
  guide: 'M3 4h18v17H3zM3 9h18M8 2v4M16 2v4M7 13h4M13 17h4',
  movies: 'M4 3h16v18H4zM8 3v18M16 3v18M4 8h4M4 16h4M16 8h4M16 16h4',
  series: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 18l10 5 10-5',
  catchup: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 3 2 21h20zM12 10v5M12 18h.01',
  stop: 'M6 6h12v12H6z',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.7M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  play: 'M7 4l13 8-13 8z',
  pause: 'M8 5v14M16 5v14',
  rewind: 'M11 7l-7 5 7 5zM20 7l-7 5 7 5z',
  forward: 'M13 7l7 5-7 5zM4 7l7 5-7 5z',
  next: 'M5 5l10 7-10 7zM19 5v14',
  archive: 'M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color, strokeWidth = 2, filled }: { name: IconName; size?: number; color: string; strokeWidth?: number; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={name === 'more' ? 3 : strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICONS[name]} />
    </Svg>
  );
}
