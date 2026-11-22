import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useLockSpatialNavigation } from 'react-tv-space-navigation';
import { dayLabel } from '../catchup/useCatchup';
import { formatDay } from '../core/format';
import { dayStart } from '../core/guide';
import type { MessageKey } from '../core/i18n';
import { useGuideState } from '../data/guide';
import type { PlumTarget } from '../data/voice';
import { usePlayerKeys } from '../player/usePlayerKeys';
import { useI18n } from '../ui/i18n';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';
import { useTimeFormat } from '../ui/useTimeFormat';
import { plum } from './plum';
import { usePlum, type PlumPhase } from './usePlum';

/** Found items shown at once at most; the list scrolls with the focus. */
const MAX_VISIBLE = 5;
/** Height of one result row with its gap, and of everything else on the card (header, text, buttons, padding). */
const ROW_HEIGHT = 66;
const CARD_CHROME = 300;

/** Rows that fit the screen: a TV (540 points tall) gets 3, a phone 5. Otherwise the card overflows. */
const visibleRows = (screenHeight: number) => Math.max(2, Math.min(MAX_VISIBLE, Math.floor((screenHeight - CARD_CHROME) / ROW_HEIGHT)));
/** After a key press the mouse pointer can't take the focus for this long. */
const HOVER_AFTER_KEY_MS = 800;

/** Touch phones show no focus ring; TV and desktop (remote / keyboard) do. */
const REMOTE = Platform.OS === 'web' || Platform.isTV;

type T = ReturnType<typeof useI18n>['t'];

interface Line {
  icon: IconName;
  title: string;
  detail: string;
  /** A small label next to the title ("Category"). */
  tag?: string;
}

function useTargetLine(): (target: PlumTarget) => Line {
  const { t, lang } = useI18n();
  const time = useTimeFormat();
  return (target) => {
    switch (target.kind) {
      case 'live':
        return { icon: 'live', title: target.channel.name, detail: t('plum.liveNow') };
      case 'catchup': {
        const { start } = target.programme;
        const day = dayLabel(dayStart(start), dayStart(Date.now()), t, (ms) => formatDay(ms, lang));
        return { icon: 'catchup', title: target.programme.title, detail: `${target.channel.name} · ${day} ${time(start)}` };
      }
      case 'movie':
        return { icon: 'movies', title: target.movie.name, detail: t('plum.movie') };
      case 'series': {
        const { season, episode } = target;
        const detail =
          season !== null && episode !== null ? t('plum.episode', { season, episode }) : season !== null ? t('plum.season', { season }) : t('plum.series');
        return { icon: 'series', title: target.series.name, detail };
      }
      case 'category':
        return {
          icon: target.section,
          title: target.name,
          detail: `${t(`nav.${target.section}` as MessageKey)} · ${target.count}`,
          tag: t('plum.category'),
        };
    }
  };
}

/** Dev builds: what the rules understood, to tell a mishearing from a bad match. */
function debugText(phase: PlumPhase): string | null {
  // Not in screenshots (dev/screenshots.mjs sets this).
  if (!__DEV__ || !('heard' in phase) || (globalThis as { __plumcastScreenshots?: boolean }).__plumcastScreenshots) return null;
  const { text, command, confident } = phase.heard;
  const parts = [`"${text}"`];
  if (command?.kind === 'play') {
    parts.push(`play "${command.title}"`);
    if (command.when) parts.push(`day ${command.when.dayOffset ?? '?'} ${command.when.timeOfDay ?? ''} ${command.when.minutes !== null ? `${Math.floor(command.when.minutes / 60)}:${String(command.when.minutes % 60).padStart(2, '0')}` : ''}`.trim());
    if (command.channel) parts.push(`on "${command.channel}"`);
    if (command.prefer) parts.push(command.prefer);
  } else if (command) parts.push(command.kind);
  parts.push(confident ? 'confident' : 'unsure');
  if (phase.kind === 'found') parts.push(phase.resolution.sure ? 'sure match' : 'ask');
  return parts.join(' · ');
}

/**
 * The Plum card: listens as soon as it opens, then shows what it understood and found.
 * ▲▼ move through the found items, ◀▶ through the buttons, Back closes. Drawn above the
 * current screen (like Dialog), so the screen keeps its place.
 */
export function PlumPanel() {
  const { t } = useI18n();
  const { phase, heard, listen, stop, play } = usePlum();
  const line = useTargetLine();
  const { lock, unlock } = useLockSpatialNavigation();
  const candidates = phase.kind === 'found' ? phase.resolution.candidates : [];
  // The remote focus inside the card; a new answer starts at its first item. More results for the
  // same answer (arriving while the guide is searched) keep the focus where it is.
  const answer: unknown = phase.kind === 'found' ? `found:${phase.heard.text}` : phase;
  const [focus, setFocus] = useState({ answer, row: 0, button: 0 });
  const { row, button } = focus.answer === answer ? focus : { row: 0, button: 0 };
  const move = (change: { row?: (r: number) => number; button?: (b: number) => number }) =>
    setFocus((prev) => {
      const base = prev.answer === answer ? prev : { answer, row: 0, button: 0 };
      return { answer, row: change.row ? change.row(base.row) : base.row, button: change.button ? change.button(base.button) : base.button };
    });
  const listening = phase.kind === 'listening';

  useEffect(() => {
    lock();
    return () => unlock();
  }, [lock, unlock]);

  const buttons: { label: string; icon: IconName; onPress: () => void }[] = [
    listening ? { label: t('plum.done'), icon: 'check', onPress: stop } : { label: t('plum.again'), icon: 'mic', onPress: listen },
    { label: t('plum.close'), icon: 'close', onPress: plum.close },
  ];
  // Rows: the candidates, then the button row.
  const onButtons = row >= candidates.length;

  // The list scrolls under a still mouse pointer, which "hovers" items: right after a key, hovering doesn't move the focus.
  const lastKey = useRef(0);
  const hover = (change: Parameters<typeof move>[0]) => {
    if (Date.now() - lastKey.current > HOVER_AFTER_KEY_MS) move(change);
  };

  usePlayerKeys((key) => {
    lastKey.current = Date.now();
    if (key === 'back') plum.close();
    else if (key === 'up') move({ row: (r) => Math.max(0, r - 1) });
    else if (key === 'down') move({ row: (r) => Math.min(candidates.length, r + 1) });
    else if (key === 'left' && onButtons) move({ button: (b) => Math.max(0, b - 1) });
    else if (key === 'right' && onButtons) move({ button: (b) => Math.min(buttons.length - 1, b + 1) });
    else if (key === 'select') {
      if (onButtons) buttons[button]?.onPress();
      else if (candidates[row]) play(candidates[row]);
    }
  });

  const debug = debugText(phase);
  const VISIBLE = visibleRows(useWindowDimensions().height);
  // Keep the focused item in view, in the middle.
  const offset = Math.max(0, Math.min(Math.min(row, candidates.length - 1) - Math.floor(VISIBLE / 2), candidates.length - VISIBLE));
  const shownItems = candidates.slice(offset, offset + VISIBLE);

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={plum.close} accessibilityLabel={t('plum.close')} />
      <View style={styles.card} accessibilityViewIsModal>
        <View style={styles.header}>
          <View style={[styles.mic, listening && styles.micOn]}>
            <Icon name="mic" size={22} color={listening ? '#ffffff' : colors.accentLight} />
          </View>
          <Text weight="bold" size={20}>{t('plum.name')}</Text>
        </View>

        <Status phase={phase} heard={heard} t={t} />

        {candidates.length ? (
          <View style={styles.list}>
            {phase.kind === 'found' && !phase.resolution.sure ? (
              <Text size={14} color={colors.textFaint}>
                {candidates.length > VISIBLE ? `${t('plum.pick')}  ${Math.min(row, candidates.length - 1) + 1} / ${candidates.length}` : t('plum.pick')}
              </Text>
            ) : null}
            {shownItems.map((target, at) => {
              const i = offset + at;
              const { icon, title, detail, tag } = line(target);
              const on = REMOTE && !onButtons && i === row;
              return (
                <Pressable key={`${target.kind}-${i}`} onPress={() => play(target)} onHoverIn={() => hover({ row: () => i })} style={[styles.item, on && styles.focused]} accessibilityRole="button" accessibilityLabel={title}>
                  <Icon name={icon} size={20} color={i === 0 ? colors.accentLight : colors.textFaint} />
                  <View style={styles.itemText}>
                    <View style={styles.titleRow}>
                      <Text weight="semibold" size={16} numberOfLines={1} style={styles.title}>{title}</Text>
                      {tag ? <Text size={11} weight="semibold" color={colors.accentLight} style={styles.tag}>{tag}</Text> : null}
                    </View>
                    <Text size={13} color={colors.textFaint} numberOfLines={1}>{detail}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {debug ? <Text size={12} color={colors.textFaint}>{debug}</Text> : null}

        <View style={styles.actions}>
          {buttons.map((b, i) => {
            const on = REMOTE && onButtons && i === button;
            const primary = i === 0;
            const fg = primary ? '#ffffff' : colors.text;
            return (
              <Pressable
                key={b.label}
                accessibilityRole="button"
                accessibilityLabel={b.label}
                onPress={b.onPress}
                onHoverIn={() => hover({ row: () => candidates.length, button: () => i })}
                style={[styles.button, primary ? styles.primary : styles.secondary, on && styles.focused]}
              >
                <Icon name={b.icon} size={18} color={fg} />
                <Text weight="semibold" size={15} color={fg}>{b.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Status({ phase, heard, t }: { phase: PlumPhase; heard: string; t: T }) {
  switch (phase.kind) {
    case 'listening':
      return (
        <View style={styles.status}>
          <Text size={18} weight="semibold">{heard || t('plum.listening')}</Text>
          {heard ? null : <Text size={14} color={colors.textFaint}>{t('plum.hint')}</Text>}
        </View>
      );
    case 'thinking':
      return <Text size={16} color={colors.textFaint}>{`"${phase.heard.text}" · ${t('plum.thinking')}`}</Text>;
    case 'found':
      // Quick results are shown while the TV guide or the archives are still searched.
      return <Text size={16} color={colors.textFaint}>{phase.searching ? `"${phase.heard.text}" · ${t('plum.stillLooking')}` : `"${phase.heard.text}"`}</Text>;
    case 'refreshing':
      return <Refreshing phase={phase} t={t} />;
    case 'not-understood':
      return (
        <View style={styles.status}>
          {phase.heard.text ? <Text size={16} color={colors.textFaint}>{`"${phase.heard.text}"`}</Text> : null}
          <Text size={18} weight="semibold">{t('plum.notUnderstood')}</Text>
        </View>
      );
    case 'not-found':
      return <Text size={18} weight="semibold">{t('plum.notFound', { text: phase.heard.command?.kind === 'play' ? phase.heard.command.title : phase.heard.text })}</Text>;
    case 'no-playlist':
      return <Text size={18} weight="semibold">{t('plum.noPlaylist')}</Text>;
    case 'problem':
      return <Text size={18} weight="semibold">{t(`plum.problem.${phase.problem}` as MessageKey)}</Text>;
  }
}

/** "Refresh the TV guide": progress while it downloads, then done or the guide's own error. */
function Refreshing({ phase, t }: { phase: Extract<PlumPhase, { kind: 'refreshing' }>; t: T }) {
  const guide = useGuideState();
  const syncing = guide.syncing?.playlistId === phase.playlistId ? guide.syncing : null;
  const problem = guide.problem[phase.playlistId];
  const text = syncing
    ? t('plum.refreshing', { n: syncing.programmes })
    : problem && problem.at >= phase.startedAt
      ? t('guide.failed')
      : t('plum.refreshed');
  return (
    <View style={styles.status}>
      <Text size={16} color={colors.textFaint}>{`"${phase.heard.text}"`}</Text>
      <Text size={18} weight="semibold">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(6,4,10,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 620,
    padding: 28,
    gap: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgRaised,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mic: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  micOn: { backgroundColor: colors.accent },
  status: { gap: 6 },
  list: { gap: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.glassStrong,
  },
  itemText: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1 },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.accentSoft },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  button: {
    height: 46,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.glassStrong },
  focused: { borderColor: colors.focusRing },
});
