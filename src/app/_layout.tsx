import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SpatialNavigationRoot, SpatialNavigationView } from 'react-tv-space-navigation';
import { I18nProvider } from '../ui/i18n';
import { configureRemote } from '../ui/remote';
import { Sidebar } from '../ui/Sidebar';
import { TabBar } from '../ui/TabBar';
import { colors } from '../ui/tokens';
import { useWideLayout } from '../ui/useWideLayout';

configureRemote();

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
  return (
    <SpatialNavigationRoot>
      <SpatialNavigationView direction={wide ? 'horizontal' : 'vertical'} style={styles.root}>
        {wide ? <Sidebar /> : null}
        <View style={styles.page}>
          <Slot />
        </View>
        {wide ? null : <TabBar />}
      </SpatialNavigationView>
    </SpatialNavigationRoot>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
});
