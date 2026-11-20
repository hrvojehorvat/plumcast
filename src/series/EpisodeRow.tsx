import { memo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { Episode, EpisodeProgress } from '../core/series';
import { formatClock, lengthParts } from '../core/vod';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';

export const EPISODE_ROW = 104;

/** Watched fraction for the progress bar (0 when not started or watched). */
export function episodeFraction(episode: Episode, progress: EpisodeProgress | undefined): number {
  if (!progress || progress.watched) return 0;
  const of = progress.durationMs ?? episode.durationMs;
  return of ? Math.min(1, progress.positionMs / of) : 0;
}

/** One episode: still, number and title, plot, length or time left, progress bar. */
export const EpisodeRow = memo(function EpisodeRow({
  episode,
  progress,
  focused,
  compact,
}: {
  episode: Episode;
  progress: EpisodeProgress | undefined;
  focused: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  const fraction = episodeFraction(episode, progress);
  const length = progress?.durationMs ?? episode.durationMs;
  const facts: string[] = [];
  if (progress?.watched) facts.push(t('movies.watched'));
  else if (fraction > 0 && length) facts.push(t('movies.left', { time: formatClock(length - progress!.positionMs) }));
  else if (length) {
    const { h, m } = lengthParts(length);
    facts.push(h ? t('movies.lengthHours', { h, m: String(m).padStart(2, '0') }) : t('movies.lengthMinutes', { m }));
  }
  const thumbWidth = compact ? 112 : 144;
  return (
    <View style={[styles.row, focused && styles.focused]}>
      <View style={[styles.thumb, { width: thumbWidth, height: Math.round((thumbWidth * 9) / 16) }]}>
        {episode.image && !broken ? (
          <Image source={{ uri: episode.image }} resizeMethod="resize" style={styles.image} resizeMode="cover" onError={() => setBroken(true)} />
        ) : (
          <Text weight="bold" size={20} color={colors.textFaint}>{episode.number}</Text>
        )}
        {fraction > 0 ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(4, Math.round(fraction * 100))}%` }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.text}>
        <Text weight="semibold" size={15} numberOfLines={1} color={focused ? colors.text : colors.textSoft}>
          {episode.title ? `${episode.number}. ${episode.title}` : t('series.episode', { n: episode.number })}
        </Text>
        {episode.plot && !compact ? (
          <Text size={13} color={colors.textMuted} numberOfLines={2}>{episode.plot}</Text>
        ) : null}
        {facts.length ? (
          <View style={styles.facts}>
            {progress?.watched ? <Icon name="check" size={13} color={colors.accentLight} /> : null}
            <Text size={12} color={progress?.watched || fraction > 0 ? colors.accentLight : colors.textFaint}>{facts.join('  ·  ')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flex: 1,
    minWidth: 0,
    height: EPISODE_ROW - 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focused: { borderColor: colors.focusRing, backgroundColor: colors.glass },
  thumb: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  track: { position: 'absolute', left: 4, right: 4, bottom: 4, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.accent },
  text: { flex: 1, minWidth: 0, gap: 3 },
  facts: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
