import { describe, expect, it } from 'vitest';
import { colors } from './tokens';

describe('design tokens', () => {
  it('derive the soft accents from the shared plum palette', () => {
    expect(colors.accent).toBe('#a45cdb');
    expect(colors.accentSoft).toBe('rgba(164,92,219,0.2)');
    expect(colors.accentRing).toBe('rgba(164,92,219,0.6)');
  });
});
