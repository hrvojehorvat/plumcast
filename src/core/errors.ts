export type PlaylistErrorCode =
  | 'invalid-url'
  | 'network'
  | 'timeout'
  | 'http'
  | 'auth'
  | 'expired'
  | 'blocked'
  | 'format'
  | 'empty'
  | 'cancelled';

/** A failure the UI can explain to the user (the code maps to a translated message). */
export class PlaylistError extends Error {
  constructor(
    readonly code: PlaylistErrorCode,
    message: string = code,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PlaylistError';
  }
}

export function toPlaylistError(error: unknown): PlaylistError {
  if (error instanceof PlaylistError) return error;
  if (error instanceof Error && error.name === 'AbortError') return new PlaylistError('cancelled');
  return new PlaylistError('network', error instanceof Error ? error.message : String(error));
}
