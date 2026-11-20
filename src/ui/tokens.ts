/**
 * Plumcast design tokens. Palette, surfaces, radii and fonts come from @mrvoje/design (shared
 * with the website's `.theme-purple`); only the logo colours and TV layout sizes live here.
 */
import { nativeColors, nativeFont, plum, radius } from '@mrvoje/design';

export { plum, radius };

/** `#rrggbb` → `rgba(r,g,b,alpha)`. */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export const colors = {
  ...nativeColors,
  accent: plum[500],
  accentLight: plum[300],
  accentLighter: plum[200],
  accentSoft: alpha(plum[500], 0.2),
  accentRing: alpha(plum[500], 0.6),
  logoFrom: '#c58cf0',
  logoTo: '#6a2aa3',
  logoTile: '#1a1424',
  logoStem: '#b98ad8',
  logoLeaf: '#8fdc9c',
} as const;

export const font = nativeFont;

export type FontWeight = keyof typeof font;

/**
 * Sizes of the TV / wide layout. A 1080p TV is only 960 × 540 layout points, so everything is
 * sized to fit that: menu rail + categories + list + side pane side by side.
 */
export const tv = {
  /** Page padding next to the menu rail. */
  padX: 20,
  padTop: 18,
  padBottom: 12,
  /** Gap between columns. */
  gap: 14,
  /** Left column (categories); on a narrower screen it shrinks down to sideMin. */
  side: 190,
  sideMin: 130,
  /** Narrowest a list column (channels, …) may get, so it never collapses. */
  listMin: 200,
  /** Page title (Live TV, Movies, …). */
  title: 22,
  /** Column heading (category name). */
  heading: 15,
} as const;
