import { describe, expect, it } from 'vitest';
import type { Channel } from '../data/live';
import { livePlayer, liveSessionSnapshot } from './store';

const ch = (id: string, num: number): Channel => ({
  id, num, name: `Channel ${id}`, logo: null, categoryId: 'c', epgId: null,
  archive: false, archiveDays: 0, url: null, catchup: null, favorite: false,
});

describe('live player zapping', () => {
  const list = [ch('a', 1), ch('b', 2), ch('c', 3)];

  it('steps through the list and wraps around', () => {
    livePlayer.open(1, list, list[0]);
    livePlayer.step(-1);
    expect(liveSessionSnapshot()?.current.id).toBe('c');
    livePlayer.step(1);
    expect(liveSessionSnapshot()?.current.id).toBe('a');
    livePlayer.step(1);
    expect(liveSessionSnapshot()?.current.id).toBe('b');
  });

  it('jumps back to the last channel and toggles between two', () => {
    livePlayer.open(1, list, list[0]);
    livePlayer.tune(list[2]);
    livePlayer.back();
    expect(liveSessionSnapshot()?.current.id).toBe('a');
    livePlayer.back();
    expect(liveSessionSnapshot()?.current.id).toBe('c');
  });

  it('remembers the last watched channel for the next session', () => {
    livePlayer.open(1, list, list[1]);
    livePlayer.close();
    expect(liveSessionSnapshot()).toBeNull();
    livePlayer.open(1, list, list[0]);
    expect(liveSessionSnapshot()?.previous?.id).toBe('b');
    livePlayer.close();
  });

  it('keeps the favourite star in sync in the list', () => {
    livePlayer.open(1, list, list[0]);
    livePlayer.patchCurrent({ favorite: true });
    expect(liveSessionSnapshot()?.list[0].favorite).toBe(true);
    livePlayer.close();
  });

  it('plays a replay, seeks inside it, and goes live', () => {
    const programme = { start: 1000, end: 5000, title: 'News', description: null };
    livePlayer.openReplay(1, list, list[1], programme);
    expect(liveSessionSnapshot()?.replay).toEqual({ programme, from: 1000 });
    livePlayer.seek(3000);
    expect(liveSessionSnapshot()?.replay?.from).toBe(3000);
    livePlayer.goLive();
    expect(liveSessionSnapshot()?.replay).toBeNull();
    expect(liveSessionSnapshot()?.current.id).toBe('b');
  });

  it('switching channel ends the replay', () => {
    livePlayer.openReplay(1, list, list[0], { start: 1, end: 2, title: 'x', description: null });
    livePlayer.step(1);
    expect(liveSessionSnapshot()?.replay).toBeNull();
  });
});
