import { Directions, SpatialNavigation } from 'react-tv-space-navigation';
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

export function configureRemote() {
  listenToRemote();
  SpatialNavigation.configureRemoteControl({
    remoteControlSubscriber: (callback) =>
      remoteKeys.setBase((type) => {
        const direction = KEY_MAP[type];
        if (direction) callback(direction);
      }),
    remoteControlUnsubscriber: (remove) => remove(),
  });
}
