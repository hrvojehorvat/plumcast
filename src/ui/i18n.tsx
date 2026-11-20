import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { MESSAGES, interpolate, langFromLocale, type Lang, type MessageKey } from '../core/i18n';
import { setPrefs, usePrefs } from '../data/prefs';

type I18n = { lang: Lang; setLang: (lang: Lang | null) => void; t: (key: MessageKey, params?: Record<string, string | number>) => string };

const I18nContext = createContext<I18n | null>(null);

function deviceLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

const setLang = (lang: Lang | null) => void setPrefs({ lang });

/** UI language: the one picked in Settings, else the device language. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const chosen = usePrefs().lang;
  const lang = useMemo(() => chosen ?? langFromLocale(deviceLocale()), [chosen]);
  const value = useMemo<I18n>(() => ({ lang, setLang, t: (key, params) => interpolate(MESSAGES[lang][key], params) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
