import { useEffect } from 'react';
import { AppState } from 'react-native';
import { AUTO_CHECK_EVERY_MS, idleIn } from '../core/guideIdle';
import { autoUpdateGuide, stopAutoUpdate, type IdleNow } from '../data/guide';
import { getPrefs, subscribePrefs } from '../data/prefs';
import { activePlaylist, playlistsSnapshot, subscribePlaylists } from '../data/store';
import { videoActivity } from '../player/videoActivity';

/** A timer may fire a moment early; this margin makes sure idle has started by then. */
const MARGIN_MS = 1_000;

function idleNow(): IdleNow {
  const video = videoActivity.snapshot();
  return {
    appActive: AppState.currentState === 'active',
    videosOnScreen: video.onScreen,
    lastVideoEndedAt: video.lastEndedAt,
    playlistBusy: playlistsSnapshot().syncing !== null,
  };
}

/**
 * Settings → TV guide → Update automatically: keeps the active playlist's guide fresh while the app is
 * open and idle (no video on screen for 30 s). Checks at start, on return to the app, after a video
 * closes, after a playlist update and every 5 minutes; a video that starts, or leaving the app, stops
 * the download. Mounted once in the root layout. It listens to the stores directly (no React state),
 * so the app doesn't re-render on every zap or sync progress step.
 */
export function useGuideAutoUpdate() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = () => {
      const playlist = activePlaylist(playlistsSnapshot());
      if (playlist && getPrefs().guideAuto) void autoUpdateGuide(playlist, idleNow);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(check, idleIn(Date.now(), videoActivity.snapshot().lastEndedAt) + MARGIN_MS);
    };

    let onScreen = videoActivity.snapshot().onScreen;
    const offVideo = videoActivity.subscribe(() => {
      const now = videoActivity.snapshot().onScreen;
      if (now > 0) {
        clearTimeout(timer);
        stopAutoUpdate();
      } else if (onScreen > 0) schedule();
      onScreen = now;
    });

    // Only a change of the active playlist or the end of a playlist update matters, not each progress step.
    let playlistKey = '';
    const offPlaylists = subscribePlaylists(() => {
      const s = playlistsSnapshot();
      const key = `${s.activeId}|${s.syncing !== null}`;
      if (key !== playlistKey) {
        playlistKey = key;
        schedule();
      }
    });

    let auto = getPrefs().guideAuto;
    const offPrefs = subscribePrefs(() => {
      const now = getPrefs().guideAuto;
      if (now === auto) return;
      auto = now;
      if (now) schedule();
      else stopAutoUpdate();
    });

    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule();
      else {
        clearTimeout(timer);
        stopAutoUpdate();
      }
    });
    const every = setInterval(check, AUTO_CHECK_EVERY_MS);
    schedule();

    return () => {
      clearTimeout(timer);
      clearInterval(every);
      offVideo();
      offPlaylists();
      offPrefs();
      app.remove();
    };
  }, []);
}
