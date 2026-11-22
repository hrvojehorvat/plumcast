import { TVEventHandler } from 'react-native';
import { createKeyLayers } from '../core/keyLayers';
import { createTvPressFilter } from '../core/tvKeys';

/**
 * The one listener for the Android TV / Fire TV remote. Every press is counted once, app-wide, and goes
 * to exactly one place: the newest open layer (player, dialog) or, with none open, spatial navigation.
 * Layers don't know long-press OK: for them a held OK is a plain OK.
 */
export const remoteKeys = createKeyLayers<string>();

const press = createTvPressFilter();
let listening = false;

export function listenToRemote() {
  if (listening || !TVEventHandler) return;
  listening = true;
  TVEventHandler.addListener((event) => {
    const type = press(event);
    if (!type) return;
    remoteKeys.dispatch(type === 'longSelect' && remoteKeys.depth > 0 ? 'select' : type);
  });
}
