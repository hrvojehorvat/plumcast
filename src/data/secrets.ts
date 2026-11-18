import * as SecureStore from 'expo-secure-store';
import type { PlaylistSecret } from '../core/models';

export type { PlaylistSecret };

const key = (playlistId: number) => `plumcast.playlist.${playlistId}`;

export async function readSecret(playlistId: number): Promise<PlaylistSecret> {
  const raw = await SecureStore.getItemAsync(key(playlistId));
  return raw ? (JSON.parse(raw) as PlaylistSecret) : {};
}

export async function writeSecret(playlistId: number, secret: PlaylistSecret) {
  await SecureStore.setItemAsync(key(playlistId), JSON.stringify(secret));
}

export async function deleteSecret(playlistId: number) {
  await SecureStore.deleteItemAsync(key(playlistId));
}
