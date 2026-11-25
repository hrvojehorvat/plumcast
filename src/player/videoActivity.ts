import { useEffect, useSyncExternalStore } from 'react';

/**
 * Whether a video is on screen (full player or the Live TV preview), and when the last one closed.
 * Background work (the TV guide download) waits for this so it never takes the connection from a video.
 */
export interface VideoActivity {
  onScreen: number;
  lastEndedAt: number | null;
}

let activity: VideoActivity = { onScreen: 0, lastEndedAt: null };
const listeners = new Set<() => void>();

function set(next: VideoActivity) {
  activity = next;
  listeners.forEach((l) => l());
}

export const videoActivity = {
  snapshot: (): VideoActivity => activity,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useVideoActivity(): VideoActivity {
  return useSyncExternalStore(videoActivity.subscribe, videoActivity.snapshot, videoActivity.snapshot);
}

/** Called by every <Video>: counts it as on screen while it is mounted. */
export function useVideoOnScreen() {
  useEffect(() => {
    set({ ...activity, onScreen: activity.onScreen + 1 });
    return () => set({ onScreen: Math.max(0, activity.onScreen - 1), lastEndedAt: Date.now() });
  }, []);
}
