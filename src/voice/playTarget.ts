import { router } from 'expo-router';
import { NAV_ITEMS } from '../core/nav';
import type { Screen } from '../core/voice';
import { resumeAt } from '../core/vod';
import { listChannels, type Channel } from '../data/live';
import type { Playlist } from '../data/playlists';
import type { PlumTarget } from '../data/voice';
import { movieTitle } from '../movies/useMovies';
import { livePlayer, moviePlayer } from '../player/store';
import { keyMark, openRight, sectionEntry } from '../ui/lastKey';
import { requestCategory } from '../ui/pendingOpen';

/** The channel's own category, so channel up/down zaps like when it's opened from Live TV. */
async function zapList(playlist: Playlist, channel: Channel): Promise<Channel[]> {
  if (!channel.categoryId) return [channel];
  try {
    const list = await listChannels(playlist.id, channel.categoryId);
    return list.length ? list : [channel];
  } catch {
    return [channel];
  }
}

/**
 * Plays what Plum found, the same way the screens do: live and replays in the live player
 * (the replay player checks the recording), movies from where they were left. A series opens
 * its page (episodes come from the server there). A category opens its section with it selected
 * and the focus in it, like the menu does.
 */
export async function playTarget(playlist: Playlist, target: PlumTarget): Promise<void> {
  switch (target.kind) {
    case 'live':
      livePlayer.open(playlist.id, await zapList(playlist, target.channel), target.channel);
      return;
    case 'catchup':
      livePlayer.openReplay(playlist.id, await zapList(playlist, target.channel), target.channel, target.programme);
      return;
    case 'movie': {
      const { title, year } = movieTitle(target.movie.name);
      moviePlayer.open(playlist.id, target.movie, year ? `${title} (${year})` : title, resumeAt(target.movie.progress) ?? 0);
      return;
    }
    case 'series':
      router.push(`/series/${encodeURIComponent(target.series.id)}`);
      return;
    case 'category':
      requestCategory(target.section, target.id);
      openScreen(target.section);
      return;
  }
}

/** Opens a section like the menu does; on TV / wide screens the focus moves into its list once it's there. */
export function openScreen(screen: Screen) {
  const item = NAV_ITEMS.find((i) => i.key === screen);
  if (!item) return;
  router.replace(item.href);
  if (item.columns) openRight(keyMark(), () => (sectionEntry(item.key)?.() ? 'done' : 'wait'));
}
