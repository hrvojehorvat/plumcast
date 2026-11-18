import { describe, expect, it } from 'vitest';
import { LANGS, MESSAGES, langFromLocale } from './index';

describe('i18n', () => {
  it('has the same keys and no empty strings in every language', () => {
    const keys = Object.keys(MESSAGES.en).sort();
    for (const lang of LANGS) {
      expect(Object.keys(MESSAGES[lang]).sort(), lang).toEqual(keys);
      for (const [key, value] of Object.entries(MESSAGES[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('picks the language from the locale', () => {
    expect(langFromLocale('de-AT')).toBe('de');
    expect(langFromLocale('hr_HR')).toBe('hr');
    expect(langFromLocale('fr-FR')).toBe('en');
    expect(langFromLocale(undefined)).toBe('en');
  });
});
