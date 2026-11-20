import { memo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';

/** Text under the poster: two lines of title, one of year / rating. */
export const POSTER_TEXT = 46;

export interface PosterProps {
  title: string;
  /** Small line under the title (year · rating, or "S2 E3"). */
  subtitle?: string;
  /** Shown in the accent colour instead of the subtitle (e.g. where a series is up to). */
  highlight?: string | null;
  image: string | null;
  favorite?: boolean;
  watched?: boolean;
  /** 0–1 resume bar; 0 hides it. */
  fraction?: number;
  width: number;
  focused: boolean;
  /** Just the image (for detail pages). */
  titleless?: boolean;
}

/** Poster card for movies and series: 2:3 image (or the first letter), title, a small line, resume bar, marks. */
export const Poster = memo(function Poster({ title, subtitle, highlight, image, favorite, watched, fraction = 0, width, focused, titleless }: PosterProps) {
  const [broken, setBroken] = useState(false);
  const height = Math.round(width * 1.5);
  return (
    <View style={{ width }}>
      <View style={[styles.frame, { height }, focused && styles.focused]}>
        {image && !broken ? (
          <Image source={{ uri: image }} resizeMethod="resize" style={styles.image} resizeMode="cover" onError={() => setBroken(true)} />
        ) : (
          <View style={styles.empty}>
            <Text weight="bold" size={28} color={colors.textFaint}>{title.slice(0, 1).toUpperCase()}</Text>
            <Text size={12} color={colors.textFaint} numberOfLines={3} style={styles.emptyTitle}>{title}</Text>
          </View>
        )}
        <View style={styles.marks}>
          {favorite ? (
            <View style={styles.mark}>
              <Icon name="star" size={13} color={colors.accentLight} filled />
            </View>
          ) : null}
          {watched ? (
            <View style={styles.mark}>
              <Icon name="check" size={13} color="#ffffff" />
            </View>
          ) : null}
        </View>
        {fraction > 0 ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(4, Math.round(fraction * 100))}%` }]} />
          </View>
        ) : null}
      </View>
      {titleless ? null : (
        <View style={styles.text}>
          <Text weight={focused ? 'semibold' : 'medium'} size={12} numberOfLines={2} color={focused ? colors.text : colors.textSoft}>{title}</Text>
          <Text size={11} color={highlight ? colors.accentLight : colors.textFaint} numberOfLines={1}>{highlight ?? subtitle ?? ''}</Text>
        </View>
      )}
    </View>
  );
});

/** "2019  ·  ★ 7.4" */
export const yearAndRating = (year: number | null, rating: number | null) =>
  [year, rating ? `★ ${rating.toFixed(1)}` : null].filter(Boolean).join('  ·  ');

const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.glassStrong, borderWidth: 3, borderColor: 'transparent' },
  focused: { borderColor: colors.focusRing },
  image: { width: '100%', height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6 },
  emptyTitle: { textAlign: 'center' },
  marks: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 },
  mark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,10,18,0.8)' },
  track: { position: 'absolute', left: 6, right: 6, bottom: 6, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  text: { height: POSTER_TEXT, paddingTop: 4, paddingHorizontal: 2, gap: 1 },
});
