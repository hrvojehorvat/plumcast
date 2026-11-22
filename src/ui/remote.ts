import { Directions, SpatialNavigation } from 'react-tv-space-navigation';
import { noteKey, setKeyHandler } from './lastKey';
import { listenToRemote, remoteKeys } from './remoteKeys';

/** Android TV / Fire TV remote: D-pad and OK move and select (when no player or dialog is open). */
const KEY_MAP: Record<string, Directions> = {
  up: Directions.UP,
  down: Directions.DOWN,
  left: Directions.LEFT,
  right: Directions.RIGHT,
  select: Directions.ENTER,
  longSelect: Directions.LONG_ENTER,
};

/** Long-press OK on a screen (no player or dialog open): opens Plum when set. Returns false to pass it on. */
let longSelect: (() => boolean) | null = null;
export function setLongSelect(handler: (() => boolean) | null) {
  longSelect = handler;
}

export function configureRemote() {
  listenToRemote();
  SpatialNavigation.configureRemoteControl({
    remoteControlSubscriber: (callback) => {
      setKeyHandler(callback);
      return remoteKeys.setBase((type) => {
        if (type === 'longSelect' && longSelect?.()) return;
        const direction = KEY_MAP[type];
        if (!direction) return;
        noteKey(direction);
        callback(direction);
      });
    },
    remoteControlUnsubscriber: (remove) => remove(),
  });
}
