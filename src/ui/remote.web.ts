import { Directions, SpatialNavigation } from 'react-tv-space-navigation';

/** Browser (dev testing and web TVs): arrow keys + Enter act as the remote. */
const KEY_MAP: Record<string, Directions> = {
  ArrowUp: Directions.UP,
  ArrowDown: Directions.DOWN,
  ArrowLeft: Directions.LEFT,
  ArrowRight: Directions.RIGHT,
  Enter: Directions.ENTER,
};

export function configureRemote() {
  SpatialNavigation.configureRemoteControl({
    remoteControlSubscriber: (callback) => {
      const onKeyDown = (event: KeyboardEvent) => {
        // Let text fields keep their own arrow keys and Enter.
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        const direction = KEY_MAP[event.key];
        if (!direction) return;
        event.preventDefault();
        callback(direction);
      };
      window.addEventListener('keydown', onKeyDown);
      return onKeyDown;
    },
    remoteControlUnsubscriber: (onKeyDown) => window.removeEventListener('keydown', onKeyDown),
  });
}
