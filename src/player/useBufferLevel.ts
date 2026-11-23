import * as Device from 'expo-device';
import { useEffect, useState } from 'react';
import { resolveLevel, type BufferLevel } from '../core/buffer';
import { getSpeed } from '../data/netSpeed';
import { usePrefs } from '../data/prefs';

/** How long to wait for the video's bitrate (movie info still loading) before Auto decides without it. */
const BITRATE_WAIT_MS = 2_000;

/** The level the last file played with (Settings shows it under Auto). */
let lastLevel: BufferLevel | null = null;
export const lastBufferLevel = () => lastLevel;

/**
 * The buffer level for one video (src/core/buffer.ts), decided once before it starts: the fixed level from
 * Settings, or Auto's choice from the playlist's remembered speed, the video's bitrate and the TV's RAM.
 * `bitrateBps` undefined = still loading (waits up to 2 s). Null until decided; the player starts then.
 * A new `itemKey` (next episode) decides again.
 */
export function useBufferLevel(itemKey: string | null, playlistId: number, bitrateBps: number | null | undefined): BufferLevel | null {
  const { movieBuffer } = usePrefs();
  const [decided, setDecided] = useState<{ key: string; level: BufferLevel } | null>(null);
  const [waitedFor, setWaitedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!itemKey || bitrateBps !== undefined) return;
    const timer = setTimeout(() => setWaitedFor(itemKey), BITRATE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [itemKey, bitrateBps]);

  const ready = itemKey !== null && decided?.key !== itemKey && (bitrateBps !== undefined || waitedFor === itemKey);
  useEffect(() => {
    if (!ready || !itemKey) return;
    let live = true;
    void getSpeed(playlistId)
      .catch(() => null)
      .then((speed) => {
        if (!live) return;
        const level = resolveLevel(movieBuffer, speed, bitrateBps ?? null, Device.totalMemory ?? null);
        lastLevel = level;
        setDecided({ key: itemKey, level });
      });
    return () => {
      live = false;
    };
    // Decided once per video: a later change (speed, settings) applies to the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, itemKey]);

  return decided && decided.key === itemKey ? decided.level : null;
}
