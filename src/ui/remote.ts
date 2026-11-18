import { TVEventHandler } from 'react-native';
import { Directions, SpatialNavigation } from 'react-tv-space-navigation';

/** Android TV / Fire TV remote: D-pad and select keys arrive as TV events. */
const KEY_MAP: Record<string, Directions> = {
  up: Directions.UP,
  down: Directions.DOWN,
  left: Directions.LEFT,
  right: Directions.RIGHT,
  select: Directions.ENTER,
  longSelect: Directions.LONG_ENTER,
};

export function configureRemote() {
  SpatialNavigation.configureRemoteControl({
    remoteControlSubscriber: (callback) =>
      TVEventHandler?.addListener((event) => {
        // Key down and key up both fire; react only once per press.
        if (event.eventKeyAction === 1) return;
        const direction = KEY_MAP[event.eventType];
        if (direction) callback(direction);
      }),
    remoteControlUnsubscriber: (subscription) => subscription?.remove(),
  });
}
