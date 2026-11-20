import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { router, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SpatialNavigationRoot, SpatialNavigationView } from 'react-tv-space-navigation';
import { backAction } from '../core/nav';
import { playlists } from '../data/store';
import { LivePlayerHost } from '../player/LivePlayer';
import { I18nProvider } from '../ui/i18n';
import { stepBack } from '../ui/lastKey';
import { configureRemote } from '../ui/remote';
import { Sidebar } from '../ui/Sidebar';
import { TabBar } from '../ui/TabBar';
import { colors } from '../ui/tokens';
import { useLatest } from '../ui/useQuery';
import { useWideLayout } from '../ui/useWideLayout';

configureRemote();
void playlists.init();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <StatusBar style="light" />
        <View style={styles.root}>{fontsLoaded ? <Shell /> : null}</View>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

/** Sidebar + page on TV and wide windows; page + bottom tabs on phones. */
function Shell() {
  const wide = useWideLayout();
  useSectionBack(wide);
  return (
    <SpatialNavigationRoot>
      <SpatialNavigationView direction={wide ? 'horizontal' : 'vertical'} style={styles.root}>
        {wide ? <Sidebar /> : null}
        <View style={styles.page}>
          <Slot />
        </View>
        {wide ? null : <TabBar />}
      </SpatialNavigationView>
      <LivePlayerHost />
    </SpatialNavigationRoot>
  );
}

/**
 * Android Back on the main sections (TV): one column left, like ◀ but a whole column at once (from a grid
 * straight to its categories); in the menu: section → Home, Home → leave the app. Registered after the
 * navigator's own handler so it wins over "go back through every page the menu opened";
 * dialogs, the player and detail pages register later still, so they keep handling Back first.
 */
function useSectionBack(wide: boolean) {
  const latest = useLatest({ pathname: usePathname(), wide });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const action = backAction(latest.current.pathname, latest.current.wide);
      if (action === 'pass') return false;
      if (latest.current.wide && stepBack()) return true;
      if (action === 'exit') BackHandler.exitApp();
      else router.replace(action.go);
      return true;
    });
    return () => sub.remove();
  }, [latest]);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
});
