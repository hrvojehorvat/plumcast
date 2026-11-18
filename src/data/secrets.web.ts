import type { PlaylistSecret } from '../core/models';

/**
 * Browser build (development testing only): there is no secure store, so this uses
 * localStorage on localhost. The Android app uses the encrypted store in secrets.ts.
 */
export type { PlaylistSecret };

const key = (playlistId: number) => `plumcast.playlist.${playlistId}`;

export async function readSecret(playlistId: number): Promise<PlaylistSecret> {
  try {
    const raw = localStorage.getItem(key(playlistId));
    return raw ? (JSON.parse(raw) as PlaylistSecret) : {};
  } catch {
    return {};
  }
}

export async function writeSecret(playlistId: number, secret: PlaylistSecret) {
  localStorage.setItem(key(playlistId), JSON.stringify(secret));
}

export async function deleteSecret(playlistId: number) {
  try {
    localStorage.removeItem(key(playlistId));
  } catch {
    // nothing stored
  }
}
