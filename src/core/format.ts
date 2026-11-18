import type { Lang } from './i18n';

const LOCALES: Record<Lang, string> = { en: 'en-GB', de: 'de-DE', hr: 'hr-HR' };

export function formatDate(ms: number, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function formatNumber(n: number, lang: Lang): string {
  try {
    return new Intl.NumberFormat(LOCALES[lang]).format(n);
  } catch {
    return String(n);
  }
}

/** Local clock time, 24-hour ("20:15"); all three UI languages use it. */
export function formatTime(ms: number, _lang?: Lang): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "How long ago" as a message key + count (Hermes has no Intl.RelativeTimeFormat). */
export function ago(ms: number, now = Date.now()): { key: 'time.justNow' | 'time.minutes' | 'time.hours' | 'time.days'; n: number } {
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000);
  if (minutes < 1) return { key: 'time.justNow', n: 0 };
  if (minutes < 60) return { key: 'time.minutes', n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'time.hours', n: hours };
  return { key: 'time.days', n: Math.floor(hours / 24) };
}
