import { useEffect } from 'react';
import { createKeyLayers } from '../core/keyLayers';
import { useLatest } from '../ui/useQuery';
import { keyFromKeyboard, type PlayerKey } from './keys';

/** Open full-screen layers (player, dialogs); only the newest gets a key. */
const layers = createKeyLayers<PlayerKey>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || layers.depth === 0) return;
    const key = keyFromKeyboard(event.key);
    if (!key) return;
    event.preventDefault();
    layers.dispatch(key);
  });
}

/** Keyboard (and web-TV remote) keys for a full-screen layer: the player or a dialog. */
export function usePlayerKeys(onKey: (key: PlayerKey) => void) {
  const handler = useLatest(onKey);

  useEffect(() => {
    listen();
    return layers.push((key) => handler.current(key));
  }, [handler]);
}
