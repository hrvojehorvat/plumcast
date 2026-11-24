import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { getPrefs, setPrefs } from '../data/prefs';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { moveAcrossLines, type ButtonRect } from './barNav';

export type Action = { key: string; icon: IconName; label: string; run: () => void; filled?: boolean };

/**
 * Show / hide the playback stats corner (the same switch as Settings → Playback stats, so it stays for the
 * next video). Last before Close in the button row: reachable with ◀/▶, out of the way. Android only: the
 * browser player has no stats. Pass the current setting (usePrefs) so the label follows it.
 */
export function statsActions(on: boolean, t: (key: 'player.showStats' | 'player.hideStats') => string): Action[] {
  if (Platform.OS === 'web') return [];
  return [{ key: 'stats', icon: 'stats', filled: false, label: t(on ? 'player.hideStats' : 'player.showStats'), run: () => void setPrefs({ playbackStats: !getPrefs().playbackStats }) }];
}

/**
 * The row of buttons in the player panel. The remote moves `highlight`; touch and mouse press directly.
 * `onButtonLayout` reports where each button sits, for ▲▼ when the row wraps (see barNav.ts).
 */
export function ActionBar({
  actions,
  highlight,
  onRun,
  onButtonLayout,
}: {
  actions: Action[];
  highlight: number;
  onRun: (action: Action) => void;
  onButtonLayout?: (index: number, rect: ButtonRect) => void;
}) {
  return (
    <View style={playerStyles.actions}>
      {actions.map((a, i) => (
        <Pressable
          key={a.key}
          accessibilityLabel={a.label}
          focusable={false}
          onPress={() => onRun(a)}
          onLayout={onButtonLayout ? (e) => onButtonLayout(i, e.nativeEvent.layout) : undefined}
          style={[playerStyles.action, i === highlight && playerStyles.actionFocused]}
        >
          <Icon name={a.icon} size={20} color={i === highlight ? colors.text : colors.textSoft} filled={a.filled} />
          {i === highlight || Platform.isTV || Platform.OS === 'web' ? <Text size={13} weight="medium">{a.label}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

/**
 * A message in the middle of the player with its own buttons. On the remote they come before
 * the action bar in one ◀/▶ row; `highlight` is the highlighted button here (-1 = none).
 */
export function ErrorCard({
  title,
  hint,
  actions = [],
  highlight = -1,
  onRun,
  icon = 'alert',
}: {
  title: string;
  hint: string;
  actions?: Action[];
  highlight?: number;
  onRun?: (action: Action) => void;
  /** 'alert' (red) for problems; anything else is drawn in the accent colour. */
  icon?: IconName;
}) {
  return (
    <View style={playerStyles.center} pointerEvents="box-none">
      <View style={playerStyles.errorCard}>
        <Icon name={icon} size={28} color={icon === 'alert' ? '#ff8787' : colors.accentLight} />
        <Text weight="semibold" size={18} style={playerStyles.centerText}>{title}</Text>
        <Text size={14} color={colors.textMuted} style={playerStyles.centerText}>{hint}</Text>
        {actions.length ? (
          <View style={playerStyles.cardActions}>
            {actions.map((a, i) => (
              <Pressable
                key={a.key}
                accessibilityLabel={a.label}
                focusable={false}
                onPress={() => onRun?.(a)}
                style={[playerStyles.action, i === highlight && playerStyles.actionFocused, i === 0 && playerStyles.cardPrimary]}
              >
                <Icon name={a.icon} size={20} color={colors.text} />
                <Text size={14} weight="semibold">{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The card's buttons and the action bar as one row for the remote. Returns which button is
 * highlighted in each; with a card on screen something is always highlighted (its first button).
 */
export function splitHighlight(highlight: number, cardCount: number): { effective: number; card: number; bar: number } {
  const effective = cardCount > 0 && highlight === -1 ? 0 : highlight;
  return { effective, card: effective < cardCount ? effective : -1, bar: effective >= cardCount ? effective - cardCount : -1 };
}

/**
 * ▲▼ in the movie and replay players: card buttons (if any) above the action bar, whose buttons may wrap
 * onto several lines. Returns the new highlight; -1 = out of the bar (▲ from its top line).
 */
export function moveVertical(highlight: number, cardCount: number, rects: readonly (ButtonRect | undefined)[], direction: 'up' | 'down'): number {
  const { effective } = splitHighlight(highlight, cardCount);
  if (effective === -1) return cardCount;
  if (effective < cardCount) return direction === 'down' ? cardCount : effective;
  const next = moveAcrossLines(rects, effective - cardCount, direction);
  if (next !== null) return cardCount + next;
  if (direction === 'down') return effective;
  return cardCount ? 0 : -1;
}

/** Moves the remote highlight through the action bar; -1 = none. */
export function moveHighlight(current: number, direction: 'left' | 'right', count: number): number {
  if (current === -1) return direction === 'right' ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + (direction === 'right' ? 1 : -1)));
}

export const playerStyles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 100 },
  flex: { flex: 1 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center', lineHeight: 20 },
  errorCard: {
    maxWidth: 480,
    margin: 24,
    padding: 24,
    gap: 10,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(18,15,26,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubble: {
    position: 'absolute',
    top: 32,
    right: 40,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(12,10,18,0.85)',
  },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24 },
  panelInner: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1100,
    padding: 20,
    gap: 10,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(12,10,18,0.88)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  channelLine: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 56, height: 36 },
  programme: { gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  // The progress line as a row the remote can be on (◀▶ seek there): room for the focus ring without the row moving.
  timeline: { marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  timelineFocused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  trackFocused: { height: 8, borderRadius: 4 },
  fillFocused: { height: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  action: {
    height: 42,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glassStrong,
  },
  actionFocused: { borderColor: colors.focusRing, backgroundColor: colors.accentSoft },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 },
  cardPrimary: { backgroundColor: colors.accent },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.accent },
});
