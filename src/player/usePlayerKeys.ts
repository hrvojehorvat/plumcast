import { useEffect } from 'react';
import { useLatest } from '../ui/useQuery';
import { BackHandler, TVEventHandler } from 'react-native';
import { keyFromTvEvent, type PlayerKey } from './keys';
import { createTvPressFilter } from '../core/tvKeys';

/** Remote keys for the full-screen player (Android TV / Fire TV / phone back button). */
export function usePlayerKeys(onKey: (key: PlayerKey) => void) {
  const handler = useLatest(onKey);

  useEffect(() => {
    const press = createTvPressFilter();
    const tv = TVEventHandler?.addListener((event) => {
      const type = press(event);
      const key = type ? keyFromTvEvent(type) : null;
      if (key) handler.current(key);
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      handler.current('back');
      return true;
    });
    return () => {
      tv?.remove();
      back.remove();
    };
  }, [handler]);
}
