import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plum } from './tokens';

describe('design tokens', () => {
  it('match the site plum palette used by .theme-purple', () => {
    const css = readFileSync(resolve(__dirname, '../../../../src/styles.css'), 'utf8');
    for (const [step, hex] of Object.entries(plum)) {
      const match = css.match(new RegExp(`--color-plum-${step}:\\s*(#[0-9a-f]{6})`, 'i'));
      expect(match?.[1]?.toLowerCase(), `--color-plum-${step}`).toBe(hex);
    }
  });
});
