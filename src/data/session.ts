import type { XtreamLogin } from '../core/xtream';
import type { Playlist } from './playlists';
import { readSecret } from './playlists';

/**
 * The active playlist's Xtream login, read from secure storage once and kept in memory
 * (stream URLs and EPG requests need it all the time). Null for M3U playlists.
 */
const cache = new Map<string, Promise<XtreamLogin | null>>();

export function loginFor(playlist: Playlist): Promise<XtreamLogin | null> {
  if (playlist.kind !== 'xtream' || !playlist.server || !playlist.username) return Promise.resolve(null);
  // The key changes when the playlist is edited, so a new password is picked up.
  const key = `${playlist.id}|${playlist.server}|${playlist.username}|${playlist.syncedAt ?? 0}`;
  let login = cache.get(key);
  if (!login) {
    const { server, username } = playlist;
    login = readSecret(playlist.id).then((s) => (s.password ? { server, username, password: s.password } : null));
    cache.set(key, login);
  }
  return login;
}
