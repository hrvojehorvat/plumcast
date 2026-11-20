import { TVEventHandler } from 'react-native';
import { Directions, SpatialNavigation } from 'react-tv-space-navigation';
import { createTvPressFilter } from '../core/tvKeys';

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
    remoteControlSubscriber: (callback) => {
      const press = createTvPressFilter();
      return TVEventHandler?.addListener((event) => {
        const type = press(event);
        const direction = type ? KEY_MAP[type] : undefined;
        if (direction) callback(direction);
      });
    },
    remoteControlUnsubscriber: (subscription) => subscription?.remove(),
  });
}
