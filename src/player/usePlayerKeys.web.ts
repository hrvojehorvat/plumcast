import { useEffect } from 'react';
import { useLatest } from '../ui/useQuery';
import { keyFromKeyboard, type PlayerKey } from './keys';

/** Keyboard (and web-TV remote) keys for the full-screen player. */
export function usePlayerKeys(onKey: (key: PlayerKey) => void) {
  const handler = useLatest(onKey);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = keyFromKeyboard(event.key);
      if (!key) return;
      event.preventDefault();
      handler.current(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handler]);
}
