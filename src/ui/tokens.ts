/**
 * Plumcast design tokens: the single source for colours, radii and fonts.
 * The site's `.theme-purple` (src/styles.css at the repo root) uses the same plum palette;
 * tokens.test.ts fails if the two drift apart.
 */
export const plum = {
  50: '#faf5fe',
  100: '#f2e6fc',
  200: '#e2c8f8',
  300: '#c79bf0',
  400: '#b47ae6',
  500: '#a45cdb',
  600: '#8a43c0',
  700: '#71359d',
  800: '#5b2c7d',
  900: '#4a2566',
} as const;

export const colors = {
  bg: '#0c0a12',
  bgRaised: '#120f1a',
  text: '#f4f1f8',
  textSoft: '#cfc8da',
  textMuted: '#a39cae',
  textFaint: '#8f879b',
  onLight: '#120e18',
  accent: plum[500],
  accentLight: plum[300],
  accentLighter: plum[200],
  accentSoft: 'rgba(164,92,219,0.2)',
  accentRing: 'rgba(164,92,219,0.6)',
  glass: 'rgba(255,255,255,0.05)',
  glassStrong: 'rgba(255,255,255,0.1)',
  border: 'rgba(255,255,255,0.07)',
  focusRing: '#ffffff',
  live: '#e03131',
  logoFrom: '#c58cf0',
  logoTo: '#6a2aa3',
  logoTile: '#1a1424',
  logoStem: '#b98ad8',
  logoLeaf: '#8fdc9c',
} as const;

export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

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
