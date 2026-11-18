import { toPlaylistError } from '../core/errors';
import type { MessageKey } from '../core/i18n';

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

/** A translated sentence for any sync/login failure. */
export function errorText(t: T, error: unknown): string {
  const e = toPlaylistError(error);
  return t(`error.${e.code}`, { status: e.status ?? '?' });
}
