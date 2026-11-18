import { Platform, useWindowDimensions } from 'react-native';

/** TV and large windows get the sidebar; phones get bottom tabs. */
export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return Platform.isTV || width >= 900;
}
