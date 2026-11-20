import { describe, expect, it } from 'vitest';
import { addDigit, keyFromKeyboard, keyFromTvEvent } from './keys';

describe('player keys', () => {
  it('maps keyboard keys', () => {
    expect(keyFromKeyboard('ArrowUp')).toBe('up');
    expect(keyFromKeyboard('Escape')).toBe('back');
    expect(keyFromKeyboard('7')).toBe('digit7');
    expect(keyFromKeyboard('PageDown')).toBe('channelDown');
    expect(keyFromKeyboard('x')).toBeNull();
  });

  it('maps TV remote events', () => {
    expect(keyFromTvEvent('select')).toBe('select');
    expect(keyFromTvEvent('3')).toBe('digit3');
    expect(keyFromTvEvent('channelUp')).toBe('channelUp');
    expect(keyFromTvEvent('blur')).toBeNull();
  });

  it('maps media buttons', () => {
    expect(keyFromTvEvent('playPause')).toBe('playPause');
    expect(keyFromTvEvent('fastForward')).toBe('fastForward');
    expect(keyFromTvEvent('next')).toBe('channelUp');
    expect(keyFromKeyboard('MediaPlayPause')).toBe('playPause');
    expect(keyFromKeyboard('MediaTrackPrevious')).toBe('channelDown');
  });

  it('collects up to four digits without leading zeros', () => {
    expect(addDigit('', '0')).toBe('0');
    expect(addDigit('0', '5')).toBe('5');
    expect(addDigit('12', '3')).toBe('123');
    expect(addDigit('1234', '5')).toBe('2345');
  });
});
