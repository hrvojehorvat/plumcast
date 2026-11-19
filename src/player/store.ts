import { useSyncExternalStore } from 'react';
import type { Programme } from '../core/epg';
import type { Channel } from '../data/live';
import { episodeLabel, type Episode, type Season } from '../core/series';
import { splitTitle } from '../core/vod';
import type { MovieItem } from '../data/movies';
import type { SeriesItem } from '../data/series';

/**
 * The full-screen live player. It is drawn above the whole app, so the screen that opened
 * it (and its remote focus) stays as it was. Only one stream ever plays: previews pause
 * while this is open (many providers allow a single connection).
 */
export interface LiveSession {
  playlistId: number;
  /** The list channel up/down moves through (the category the user opened it from). */
  list: Channel[];
  current: Channel;
  /** For "last channel". */
  previous: Channel | null;
  /** Set while a past programme (or the current one from its start) plays instead of live. */
  replay: Replay | null;
}

export interface Replay {
  programme: Programme;
  /** Where playback (re)started, unix ms; a seek starts a new stream from here. */
  from: number;
}

let session: LiveSession | null = null;
const listeners = new Set<() => void>();
const set = (next: LiveSession | null) => {
  session = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const liveSessionSnapshot = () => session;

export function useLiveSession(): LiveSession | null {
  return useSyncExternalStore(subscribe, () => session, () => session);
}

/** Last channel watched in this app run, kept after the player closes. */
let lastWatched: Channel | null = null;

export const livePlayer = {
  open(playlistId: number, list: Channel[], channel: Channel) {
    setMovie(null);
    set({ playlistId, list, current: channel, previous: lastWatched && lastWatched.id !== channel.id ? lastWatched : null, replay: null });
  },
  /** Plays a programme from the archive, from its start or from `from`. */
  openReplay(playlistId: number, list: Channel[], channel: Channel, programme: Programme, from = programme.start) {
    setMovie(null);
    const previous = session?.previous ?? (lastWatched && lastWatched.id !== channel.id ? lastWatched : null);
    set({ playlistId, list, current: channel, previous, replay: { programme, from } });
  },
  /** Jumps within the replay (a new stream from `from`). */
  seek(from: number) {
    if (!session?.replay) return;
    set({ ...session, replay: { ...session.replay, from } });
  },
  /** Leaves the replay and watches the channel live. */
  goLive() {
    if (session?.replay) set({ ...session, replay: null });
  },
  close() {
    if (session) lastWatched = session.current;
    set(null);
  },
  /** Switch to a channel; the one before becomes "last channel". */
  tune(channel: Channel) {
    if (!session || channel.id === session.current.id) return;
    set({ ...session, previous: session.current, current: channel, replay: null });
  },
  /** +1 = next in the list, -1 = previous; wraps around. */
  step(delta: 1 | -1) {
    if (!session || !session.list.length) return;
    const { list, current } = session;
    const at = list.findIndex((c) => c.id === current.id);
    const index = at === -1 ? (delta === 1 ? 0 : list.length - 1) : (at + delta + list.length) % list.length;
    livePlayer.tune(list[index]);
  },
  back() {
    if (session?.previous) livePlayer.tune(session.previous);
  },
  /** Keeps the star in sync after toggling a favourite. */
  patchCurrent(patch: Partial<Channel>) {
    if (!session) return;
    const current = { ...session.current, ...patch };
    set({ ...session, current, list: session.list.map((c) => (c.id === current.id ? current : c)) });
  },
};

// ---- movies and episodes ----

/** What plays in the VOD player: a movie, or an episode of a series (with its seasons, for "next episode"). */
export type VodItem =
  | { kind: 'movie'; movie: MovieItem }
  | { kind: 'episode'; series: SeriesItem; seasons: Season[]; episode: Episode };

/** A movie or episode playing full screen (instead of a live / replay session; only one stream at a time). */
export interface VodSession {
  playlistId: number;
  item: VodItem;
  /** Shown in the player. */
  title: string;
  /** Where playback starts, ms into the file. */
  startMs: number;
}

let vodSession: VodSession | null = null;
const vodListeners = new Set<() => void>();
const setMovie = (next: VodSession | null) => {
  vodSession = next;
  vodListeners.forEach((l) => l());
};
const subscribeVod = (l: () => void) => {
  vodListeners.add(l);
  return () => vodListeners.delete(l);
};

export function useVodSession(): VodSession | null {
  return useSyncExternalStore(subscribeVod, () => vodSession, () => vodSession);
}

/** Key that changes when another movie / episode starts (the player starts fresh). */
export const vodKey = (s: VodSession) => `${s.playlistId}|${s.item.kind}|${s.item.kind === 'movie' ? s.item.movie.id : s.item.episode.id}`;

/** "Show · S1 E3 · Title" */
export function episodeTitleLine(series: Pick<SeriesItem, 'name'>, episode: Episode): string {
  return [splitTitle(series.name).title, episodeLabel(episode), episode.title].filter(Boolean).join('  ·  ');
}

export const moviePlayer = {
  open(playlistId: number, movie: MovieItem, title: string, startMs = 0) {
    livePlayer.close();
    setMovie({ playlistId, item: { kind: 'movie', movie }, title, startMs });
  },
  openEpisode(playlistId: number, series: SeriesItem, seasons: Season[], episode: Episode, startMs = 0) {
    livePlayer.close();
    setMovie({ playlistId, item: { kind: 'episode', series, seasons, episode }, title: episodeTitleLine(series, episode), startMs });
  },
  close() {
    setMovie(null);
  },
};
