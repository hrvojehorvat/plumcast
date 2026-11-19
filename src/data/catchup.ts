import { useMemo } from 'react';
import { catchupUrl, replayable, replayDays, replaySources } from '../core/catchup';
import { parseShortEpg, type Programme } from '../core/epg';
import { shiftProgrammes } from '../core/guide';
import { getJson } from '../core/http';
import { apiUrl } from '../core/xtream';
import { useGuideVersion } from './guide';
import { programmesByEpgId } from './guideDb';
import { listChannels, recentlyAired, type AiredItem, type Channel } from './live';
import { appFetch } from './net';
import { probeStream } from './probe';
import { readSecret, type Playlist } from './playlists';
import { usePrefs } from './prefs';
import { loginFor } from './session';
import { useQuery } from '../ui/useQuery';
import { useNow } from './epg';

/**
 * Past programmes that can be replayed. Xtream: the provider's archive table for the channel
 * (`get_simple_data_table`, says per programme whether a recording exists). Falls back to the
 * stored guide, and M3U playlists always use the stored guide.
 */

const TABLE_FRESH_MS = 10 * 60_000;
const tables = new Map<string, { at: number; list: Promise<Programme[]> }>();

function archiveTable(playlist: Playlist, channelId: string): Promise<Programme[]> {
  const key = `${playlist.id}:${playlist.syncedAt ?? 0}:${channelId}`;
  const hit = tables.get(key);
  if (hit && Date.now() - hit.at < TABLE_FRESH_MS) return hit.list;
  const list = (async () => {
    const login = await loginFor(playlist);
    if (!login) return [];
    const json = await getJson(appFetch, apiUrl(login, 'get_simple_data_table', { stream_id: channelId }), { timeoutMs: 20_000 });
    return parseShortEpg(json);
  })();
  tables.set(key, { at: Date.now(), list });
  // A failed request is asked again next time.
  list.catch(() => tables.delete(key));
  return list;
}

async function usesArchiveTable(playlist: Playlist): Promise<boolean> {
  if (playlist.kind !== 'xtream') return false;
  const secret = await readSecret(playlist.id).catch(() => ({ guideOverride: false }));
  return !secret.guideOverride;
}

async function loadArchive(playlist: Playlist, channel: Channel, now: number): Promise<Programme[]> {
  const from = now - replayDays(channel) * 24 * 60 * 60_000;
  if (await usesArchiveTable(playlist)) {
    try {
      const list = await archiveTable(playlist, channel.id);
      if (list.length) return list;
    } catch (error) {
      console.warn('[catch-up] archive table failed, using the stored guide', error instanceof Error ? error.message : error);
    }
  }
  return channel.epgId ? programmesByEpgId(playlist.id, channel.epgId, from - 12 * 3_600_000, now + 12 * 3_600_000) : [];
}

/**
 * A channel's replayable programmes, newest first, with the user's time correction applied.
 * undefined while loading. Refreshes every few minutes, so programmes that just ended show up.
 */
export function useArchive(playlist: Playlist | null, channel: Channel | null): Programme[] | undefined {
  const { epgOffsetHours } = usePrefs();
  const version = useGuideVersion(playlist?.id ?? 0);
  const now = useNow(60_000);
  const key = playlist && channel && replayDays(channel) > 0 ? `${playlist.id}|${playlist.syncedAt ?? 0}|${channel.id}|${epgOffsetHours}|${version}` : null;
  const list = useQuery(key, () => loadArchive(playlist!, channel!, now), now);
  return useMemo(
    () => (list && channel ? replayable(channel, shiftProgrammes(list, epgOffsetHours), now) : undefined),
    [list, channel, epgOffsetHours, now],
  );
}

const RECENT_HOURS = 12;

/** Programmes that ended in the last hours on catch-up channels of a list, newest first. */
export function useRecentlyAired(playlist: Playlist | null, categoryId: string | null): AiredItem[] | undefined {
  const { epgOffsetHours } = usePrefs();
  const version = useGuideVersion(playlist?.id ?? 0);
  const now = useNow(5 * 60_000);
  const shift = epgOffsetHours * 3_600_000;
  const key = playlist && categoryId ? `${playlist.id}|${playlist.syncedAt ?? 0}|${categoryId}|${epgOffsetHours}|${version}` : null;
  return useQuery(key, async () => {
    const rows = await recentlyAired(playlist!.id, categoryId!, now - RECENT_HOURS * 3_600_000 - shift, now - shift);
    return rows
      .map((r) => ({ ...r, programme: { ...r.programme, start: r.programme.start + shift, end: r.programme.end + shift } }))
      .filter((r) => r.programme.start >= now - replayDays(r.channel) * 24 * 3_600_000);
  }, now);
}

/** Replay link for a channel from `start` to `end` (null when it can't be built). */
export async function replayUrl(playlist: Playlist, channel: Channel, start: number, end: number): Promise<string | null> {
  const login = channel.url ? null : await loginFor(playlist);
  return catchupUrl(channel, login, playlist.account?.serverTimezone ?? null, start, end, Date.now());
}

export type ReplayFind = { url: string; source: Channel } | { url: null; reason: 'missing' | 'nolink' };

/** Copies of a channel tried at most (each check is one short request). */
const MAX_SOURCES = 4;

/**
 * A replay link that has the recording: the channel's own, or one of its copies in the same
 * list when the provider records only that one (see `replaySources`). `preferred`: the copy that
 * worked last time (seeking keeps using it).
 */
export async function findReplay(playlist: Playlist, channel: Channel, start: number, end: number, preferred: string | null): Promise<ReplayFind> {
  let others: Channel[] = [];
  if (channel.categoryId) {
    try {
      others = await listChannels(playlist.id, channel.categoryId);
    } catch (error) {
      console.warn('[catch-up] could not list channel copies', error instanceof Error ? error.message : error);
    }
  }
  let anyLink = false;
  let recordedMissing = false;
  for (const source of replaySources(channel, others, preferred).slice(0, MAX_SOURCES)) {
    // The copy the provider records has a gap here: the unflagged ones only give a filler clip.
    if (!source.archive && recordedMissing) continue;
    const url = await replayUrl(playlist, source, start, end).catch(() => null);
    if (!url) continue;
    anyLink = true;
    if ((await probeStream(url)) !== 'missing') return { url, source };
    if (source.archive) recordedMissing = true;
  }
  return { url: null, reason: anyLink ? 'missing' : 'nolink' };
}
