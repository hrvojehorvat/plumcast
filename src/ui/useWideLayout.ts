import { Platform, useWindowDimensions } from 'react-native';

/** Web only (dev testing): `?tv` in the address shows the TV layout at any window size. */
const forceTv = Platform.OS === 'web' && typeof location !== 'undefined' && new URLSearchParams(location.search).has('tv');

/** TV and large windows get the sidebar; phones get bottom tabs. */
export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return Platform.isTV || forceTv || width >= 900;
}
