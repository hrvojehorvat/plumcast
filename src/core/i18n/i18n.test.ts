import { describe, expect, it } from 'vitest';
import { LANGS, MESSAGES, interpolate, langFromLocale } from './index';

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

  it('fills placeholders and keeps the same placeholders in every language', () => {
    expect(interpolate('Updated {when}', { when: 'now' })).toBe('Updated now');
    expect(interpolate('{n} of {max}', { n: 1 })).toBe('1 of {max}');
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      for (const lang of LANGS) expect(names(MESSAGES[lang][key as keyof typeof MESSAGES.en]), `${lang}.${key}`).toEqual(names(value));
    }
  });
});
