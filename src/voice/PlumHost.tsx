import { useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLiveSession, useVodSession } from '../player/store';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { setLongSelect } from '../ui/remote';
import { colors } from '../ui/tokens';
import { plum, PLUM_DEV_SAY, usePlumOpen } from './plum';
import { PlumPanel } from './PlumPanel';
import { speechAvailable } from './useSpeech';

/** Height of the phone tab bar the mic button sits above (src/ui/TabBar.tsx). */
const TAB_BAR = 64;

/**
 * Mounted once at the root. Opens Plum with long-press OK (TV remote) or the V key (browser),
 * and shows the panel while it's open. Without speech recognition on the device (Fire TV),
 * nothing opens it and nothing shows.
 */
export function PlumHost() {
  const open = usePlumOpen();
  const available = usePlumAvailable();

  useEffect(() => {
    if (!available) return;
    setLongSelect(() => {
      plum.open();
      return true;
    });
    return () => setLongSelect(null);
  }, [available]);

  useEffect(() => {
    if (!available || Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key.toLowerCase() !== 'v' || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      plum.open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [available]);

  return open && available ? <PlumPanel /> : null;
}

/** Whether this device can use Plum (has speech recognition). */
export function usePlumAvailable(): boolean {
  // Dev browser builds show Plum without a recognizer too (screenshots feed it text).
  return useMemo(() => speechAvailable() || PLUM_DEV_SAY, []);
}

/** Phones: a round mic button above the bottom tabs (they're full). Hidden while something plays. */
export function PlumPhoneButton() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const available = usePlumAvailable();
  const open = usePlumOpen();
  // Its Android shadow would draw it above the full-screen player.
  const live = useLiveSession();
  const vod = useVodSession();
  const playing = live !== null || vod !== null;
  if (!available || open || playing) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('plum.ask')}
      onPress={plum.open}
      style={[styles.fab, { bottom: TAB_BAR + Math.max(insets.bottom, 10) + 12 }]}
    >
      <Icon name="mic" size={24} color="#ffffff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    zIndex: 40,
    elevation: 6,
  },
});
