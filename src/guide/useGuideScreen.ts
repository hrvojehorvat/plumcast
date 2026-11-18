import { useEffect, useMemo, useState } from 'react';
import type { Programme } from '../core/epg';
import { ago } from '../core/format';
import { dayStart, guideDays } from '../core/guide';
import { useNow } from '../data/epg';
import { ensureGuide, useGuideState, useGuideStatus } from '../data/guide';
import type { Channel } from '../data/live';
import type { Playlist } from '../data/playlists';
import { usePrefs } from '../data/prefs';
import { defaultCategory, useChannels, useLiveCategories } from '../live/useLive';
import { livePlayer } from '../player/store';
import { useI18n } from '../ui/i18n';

/** Remembered while the app runs. */
let lastCategory: string | null = null;

export interface Detail {
  channel: Channel;
  programme: Programme;
}

/** State shared by the TV grid and the phone guide: days, category, channels, the open programme. */
export function useGuideScreen(playlist: Playlist) {
  const status = useGuideStatus(playlist);
  const { epgOffsetHours } = usePrefs();

  useEffect(() => {
    void ensureGuide(playlist);
  }, [playlist]);

  const shift = epgOffsetHours * 3_600_000;
  const days = useMemo(
    () => guideDays(status?.first != null ? status.first + shift : null, status?.last != null ? status.last + shift : null),
    [status, shift],
  );
  const [chosenDay, setDay] = useState<number | null>(null);
  const today = dayStart(useNow(60_000));
  const day = chosenDay !== null && days.includes(chosenDay) ? chosenDay : today;

  const categories = useLiveCategories(playlist);
  const [chosen, setChosen] = useState<string | null>(lastCategory);
  const selected = categories ? (chosen && categories.some((c) => c.id === chosen) ? chosen : defaultCategory(categories)) : null;
  const category = categories?.find((c) => c.id === selected) ?? null;
  const selectCategory = (id: string) => {
    lastCategory = id;
    setChosen(id);
  };
  const channels = useChannels(playlist, selected, '');

  const [detail, setDetail] = useState<Detail | null>(null);
  const watch = (channel: Channel) => {
    setDetail(null);
    livePlayer.open(playlist.id, channels ?? [channel], channel);
  };

  return { status, days, day, today, setDay, categories, selected, category, selectCategory, channels, detail, setDetail, watch };
}

/** One line about the guide: downloading, failed, or when it was updated. */
export function useGuideStatusLine(playlist: Playlist): { text: string; problem: boolean; busy: boolean } {
  const { t } = useI18n();
  const state = useGuideState();
  const status = state.status[playlist.id];
  const syncing = state.syncing?.playlistId === playlist.id ? state.syncing : null;
  const problem = state.problem[playlist.id];
  if (syncing) {
    const text = syncing.phase === 'save'
      ? t('guide.saving', { n: syncing.programmes })
      : syncing.bytes > 0
        ? t('guide.downloading', { mb: (syncing.bytes / 1_048_576).toFixed(1) })
        : t('guide.loading');
    return { text, problem: false, busy: true };
  }
  if (problem) {
    const text = problem.code === 'no-source'
      ? t('guide.noSource')
      : problem.code === 'no-match'
        ? t('guide.noMatch')
        : problem.code === 'http'
          ? t('guide.failed')
          : `${t('guide.failed')} ${t(`error.${problem.code}`)}`;
    return { text, problem: true, busy: false };
  }
  if (status) {
    const a = ago(status.fetchedAt);
    return { text: t('guide.updated', { when: t(a.key, { n: a.n }), n: status.count }), problem: false, busy: false };
  }
  return { text: status === null ? t('guide.never') : '', problem: false, busy: false };
}
