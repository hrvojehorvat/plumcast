// Import each weight on its own: the package index would bundle all 18 Inter files.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from '@expo-google-fonts/inter/useFonts';
import { router, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SpatialNavigationRoot, SpatialNavigationView } from 'react-tv-space-navigation';
import { backAction } from '../core/nav';
import { playlists } from '../data/store';
import { useGuideAutoUpdate } from '../guide/useGuideAutoUpdate';
import { LivePlayerHost } from '../player/LivePlayer';
import { I18nProvider } from '../ui/i18n';
import { stepBack } from '../ui/lastKey';
import { configureRemote } from '../ui/remote';
import { Sidebar } from '../ui/Sidebar';
import { TabBar } from '../ui/TabBar';
import { colors } from '../ui/tokens';
import { useLatest } from '../ui/useQuery';
import { useWideLayout } from '../ui/useWideLayout';
import { PlumHost, PlumPhoneButton } from '../voice/PlumHost';

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
  useGuideAutoUpdate();
  return (
    <SpatialNavigationRoot>
      <SpatialNavigationView direction={wide ? 'horizontal' : 'vertical'} style={styles.root}>
        {wide ? <Sidebar /> : null}
        <View style={styles.page}>
          <Slot />
        </View>
        {wide ? null : <TabBar />}
      </SpatialNavigationView>
      {wide ? null : <PlumPhoneButton />}
      <LivePlayerHost />
      <PlumHost />
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
