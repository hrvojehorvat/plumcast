import type { Programme } from '../core/epg';
import { shiftProgrammes } from '../core/guide';
import { useGuideVersion } from '../data/guide';
import { programmesByEpgId } from '../data/guideDb';
import type { Playlist } from '../data/playlists';
import { usePrefs } from '../data/prefs';
import { useQuery } from '../ui/useQuery';

const NONE: Programme[] = [];

/**
 * A channel's programmes overlapping [from, to), with the user's time correction applied.
 * undefined while loading; empty when the channel has no guide id or no programmes.
 */
export function useChannelProgrammes(playlist: Playlist, epgId: string | null, from: number, to: number): Programme[] | undefined {
  const version = useGuideVersion(playlist.id);
  const { epgOffsetHours } = usePrefs();
  const shift = epgOffsetHours * 3_600_000;
  const key = epgId ? `${playlist.id}|${epgId}|${from}|${to}|${version}|${epgOffsetHours}` : null;
  const list = useQuery(key, async () => shiftProgrammes(await programmesByEpgId(playlist.id, epgId!, from - shift, to - shift), epgOffsetHours));
  return epgId ? list : NONE;
}
