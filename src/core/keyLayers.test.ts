import { describe, expect, it, vi } from 'vitest';
import { createKeyLayers } from './keyLayers';

describe('createKeyLayers', () => {
  it('sends keys to the base while no layer is open', () => {
    const keys = createKeyLayers<string>();
    const base = vi.fn();
    keys.setBase(base);
    keys.dispatch('down');
    expect(base).toHaveBeenCalledWith('down');
  });

  it('sends keys only to the newest layer', () => {
    const keys = createKeyLayers<string>();
    const base = vi.fn();
    const player = vi.fn();
    const dialog = vi.fn();
    keys.setBase(base);
    const closePlayer = keys.push(player);
    const closeDialog = keys.push(dialog);
    keys.dispatch('select');
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(player).not.toHaveBeenCalled();
    expect(base).not.toHaveBeenCalled();
    closeDialog();
    keys.dispatch('left');
    expect(player).toHaveBeenCalledWith('left');
    closePlayer();
    keys.dispatch('up');
    expect(base).toHaveBeenCalledWith('up');
    expect(keys.depth).toBe(0);
  });

  it('removes layers in any order', () => {
    const keys = createKeyLayers<string>();
    const a = vi.fn();
    const b = vi.fn();
    const closeA = keys.push(a);
    keys.push(b);
    closeA();
    closeA();
    keys.dispatch('right');
    expect(b).toHaveBeenCalledWith('right');
    expect(a).not.toHaveBeenCalled();
  });

  it('keeps the newer base when an older one unsubscribes late', () => {
    const keys = createKeyLayers<string>();
    const old = vi.fn();
    const fresh = vi.fn();
    const removeOld = keys.setBase(old);
    keys.setBase(fresh);
    removeOld();
    keys.dispatch('down');
    expect(fresh).toHaveBeenCalledWith('down');
    expect(old).not.toHaveBeenCalled();
  });

  it('drops keys with nothing listening', () => {
    const keys = createKeyLayers<string>();
    expect(() => keys.dispatch('down')).not.toThrow();
  });
});
