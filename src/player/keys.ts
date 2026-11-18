/** Keys the player reacts to, from the TV remote or a keyboard. */
export type PlayerKey = 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'channelUp' | 'channelDown' | 'info' | `digit${string}`;

/** Keyboard event key → player key (browser). */
export function keyFromKeyboard(key: string): PlayerKey | null {
  if (/^[0-9]$/.test(key)) return `digit${key}`;
  switch (key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'Enter':
    case ' ': return 'select';
    case 'Escape':
    case 'Backspace':
    case 'BrowserBack': return 'back';
    case 'PageUp':
    case 'ChannelUp': return 'channelUp';
    case 'PageDown':
    case 'ChannelDown': return 'channelDown';
    case 'i':
    case 'Info': return 'info';
    default: return null;
  }
}

/** react-native-tvos TV event type → player key (Android TV / Fire TV). */
export function keyFromTvEvent(eventType: string): PlayerKey | null {
  if (/^[0-9]$/.test(eventType)) return `digit${eventType}`;
  switch (eventType) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
    case 'select': return eventType;
    case 'channelUp':
    case 'pageUp': return 'channelUp';
    case 'channelDown':
    case 'pageDown': return 'channelDown';
    case 'info':
    case 'menu': return 'info';
    default: return null;
  }
}

/**
 * Typed channel number: digits collect for a moment, then the number is used.
 * Returns the new buffer; max 4 digits.
 */
export function addDigit(buffer: string, digit: string): string {
  const next = (buffer + digit).replace(/^0+(?=\d)/, '');
  return next.length > 4 ? next.slice(-4) : next;
}
