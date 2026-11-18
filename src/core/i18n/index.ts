import { de } from './de';
import { en, type MessageKey, type Messages } from './en';
import { hr } from './hr';

export type Lang = 'en' | 'de' | 'hr';
export type { MessageKey, Messages };

export const LANGS: readonly Lang[] = ['en', 'de', 'hr'];
export const MESSAGES: Record<Lang, Messages> = { en, de, hr };

/** Picks a supported UI language from a BCP 47 locale ("de-AT" → "de"), falling back to English. */
export function langFromLocale(locale: string | undefined): Lang {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  return LANGS.find((l) => l === base) ?? 'en';
}
