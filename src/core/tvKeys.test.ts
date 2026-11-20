import { describe, expect, it } from 'vitest';
import { createTvPressFilter } from './tvKeys';

describe('createTvPressFilter', () => {
  it('uses key-ups as presses when Android sends only key-ups', () => {
    const press = createTvPressFilter();
    expect(press({ eventType: 'right', eventKeyAction: 1 })).toBe('right');
    expect(press({ eventType: 'select', eventKeyAction: 1 })).toBe('select');
  });

  it('counts a press once when key-downs arrive too', () => {
    const press = createTvPressFilter();
    expect(press({ eventType: 'down', eventKeyAction: 0 })).toBe('down');
    expect(press({ eventType: 'down', eventKeyAction: 1 })).toBeNull();
    expect(press({ eventType: 'select', eventKeyAction: 0 })).toBe('select');
    expect(press({ eventType: 'select', eventKeyAction: 1 })).toBeNull();
  });

  it('repeats a held direction and keeps long select apart', () => {
    const press = createTvPressFilter();
    expect(press({ eventType: 'longDown', eventKeyAction: 0 })).toBe('down');
    expect(press({ eventType: 'longSelect', eventKeyAction: 0 })).toBe('longSelect');
    expect(press({ eventType: 'longDown', eventKeyAction: 1 })).toBeNull();
  });

  it('counts a press the remote sends twice once', () => {
    let t = 1000;
    const press = createTvPressFilter(() => t);
    expect(press({ eventType: 'left', eventKeyAction: 0 })).toBe('left');
    t += 40;
    expect(press({ eventType: 'left', eventKeyAction: 0 })).toBeNull();
    t += 40;
    expect(press({ eventType: 'right', eventKeyAction: 0 })).toBe('right');
    t += 300;
    expect(press({ eventType: 'right', eventKeyAction: 0 })).toBe('right');
    t += 400;
    expect(press({ eventType: 'longRight', eventKeyAction: 0 })).toBe('right');
  });

  it('passes events without a key phase', () => {
    const press = createTvPressFilter();
    expect(press({ eventType: 'playPause', eventKeyAction: -1 })).toBe('playPause');
    expect(press({ eventType: 'menu' })).toBe('menu');
  });
});
