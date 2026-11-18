import type { PlaylistDraft, PlaylistKind } from './models';
import { normalizeServer, parseXtreamLink } from './xtream';

export interface PlaylistFormValues {
  kind: PlaylistKind;
  name: string;
  server: string;
  username: string;
  password: string;
  m3uUrl: string;
  /** Picked M3U file (name + contents), if any. */
  file: { name: string; text: string } | null;
}

export const EMPTY_FORM: PlaylistFormValues = { kind: 'xtream', name: '', server: '', username: '', password: '', m3uUrl: '', file: null };

/** The saved playlist being edited, if any (secrets are never shown again). */
export interface EditedPlaylist {
  kind: PlaylistKind;
  server: string | null;
  username: string | null;
}

export type FormProblem = 'server' | 'username' | 'password' | 'm3uUrl' | 'file';

export type FormResult =
  | {
      ok: true;
      draft: PlaylistDraft;
      /** Download the catalog before saving: always for a new playlist, on edit only when the source changed. */
      needsSync: boolean;
    }
  | { ok: false; problem: FormProblem };

const HTTP_URL = /^https?:\/\/[^\s/?#]+[^\s]*$/i;

export function hostOf(url: string): string | null {
  return /^[a-z]+:\/\/(?:[^@/]*@)?([^/:?#]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? null;
}

/**
 * When the user pastes a provider link (`…/get.php?username=U&password=P…`) into the
 * server field, split it into server, username and password.
 */
export function applyServerInput(values: PlaylistFormValues, input: string): PlaylistFormValues {
  const link = /[?&]username=/i.test(input) ? parseXtreamLink(input) : null;
  if (!link?.username) return { ...values, server: input };
  return { ...values, server: link.server, username: link.username, password: link.password ?? values.password };
}

/** Checks the form and turns it into what gets stored. Blank secrets on edit keep the saved ones. */
export function validatePlaylistForm(values: PlaylistFormValues, edited: EditedPlaylist | null = null): FormResult {
  const sameKind = edited?.kind === values.kind;
  const name = values.name.trim();

  if (values.kind === 'xtream') {
    const server = normalizeServer(values.server);
    const username = values.username.trim();
    const password = values.password;
    if (!server) return { ok: false, problem: 'server' };
    if (!username) return { ok: false, problem: 'username' };
    if (!password && !sameKind) return { ok: false, problem: 'password' };
    const needsSync = !sameKind || server !== edited?.server || username !== edited?.username || !!password;
    return {
      ok: true,
      needsSync,
      draft: { name: name || hostOf(server) || 'Xtream', kind: 'xtream', server, username, secret: password ? { password } : {} },
    };
  }

  if (values.kind === 'm3u-url') {
    const url = values.m3uUrl.trim();
    if (url && !HTTP_URL.test(url)) return { ok: false, problem: 'm3uUrl' };
    if (!url && !sameKind) return { ok: false, problem: 'm3uUrl' };
    const server = url ? hostOf(url) : (edited?.server ?? null);
    return {
      ok: true,
      needsSync: !sameKind || !!url,
      draft: { name: name || server || 'M3U', kind: 'm3u-url', server, username: null, secret: url ? { m3uUrl: url } : {} },
    };
  }

  if (!values.file && !sameKind) return { ok: false, problem: 'file' };
  const fileName = values.file?.name.replace(/\.m3u8?$/i, '') ?? '';
  return {
    ok: true,
    needsSync: !!values.file,
    draft: { name: name || fileName || 'M3U', kind: 'm3u-file', server: null, username: null, secret: {} },
  };
}

/** A day; playlists not updated for this long refresh on app start. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** File playlists can't refresh themselves (the user has to pick the file again). */
export function canRefresh(kind: PlaylistKind): boolean {
  return kind !== 'm3u-file';
}

export function isStale(playlist: { kind: PlaylistKind; syncedAt: number | null }, now = Date.now()): boolean {
  return canRefresh(playlist.kind) && (playlist.syncedAt === null || now - playlist.syncedAt > STALE_AFTER_MS);
}
