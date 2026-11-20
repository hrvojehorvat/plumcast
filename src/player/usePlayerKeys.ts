import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useLatest } from '../ui/useQuery';
import { listenToRemote, remoteKeys } from '../ui/remoteKeys';
import { keyFromTvEvent, type PlayerKey } from './keys';

/**
 * Remote keys for a full-screen layer: the player or a dialog (Android TV / Fire TV / phone back button).
 * While it is mounted it is the top layer: it gets every key and nothing under it does.
 */
export function usePlayerKeys(onKey: (key: PlayerKey) => void) {
  const handler = useLatest(onKey);

  useEffect(() => {
    listenToRemote();
    const close = remoteKeys.push((type) => {
      const key = keyFromTvEvent(type);
      if (key) handler.current(key);
    });
    // Back handlers run newest first, so the top layer also gets Back first.
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      handler.current('back');
      return true;
    });
    return () => {
      close();
      back.remove();
    };
  }, [handler]);
}
