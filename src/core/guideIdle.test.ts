import { describe, expect, it } from 'vitest';
import { AUTO_CHECK_EVERY_MS, IDLE_AFTER_VIDEO_MS, idleIn, shouldAutoUpdate, type AutoUpdateInput } from './guideIdle';

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = 1_700_000_000_000;

/** An idle app with a stale guide: the case where an update should start. */
function input(over: Partial<AutoUpdateInput> = {}): AutoUpdateInput {
  return {
    now: NOW,
    enabled: true,
    appActive: true,
    videosOnScreen: 0,
    lastVideoEndedAt: null,
    busy: false,
    fetchedAt: NOW - 48 * HOUR,
    lastFailureAt: null,
    freshMs: 24 * HOUR,
    retryFailedMs: 30 * MIN,
    ...over,
  };
}

describe('guide auto update constants', () => {
  it('waits 30 seconds after a video and checks every 5 minutes', () => {
    expect(IDLE_AFTER_VIDEO_MS).toBe(30_000);
    expect(AUTO_CHECK_EVERY_MS).toBe(5 * MIN);
  });
});

describe('shouldAutoUpdate', () => {
  it('updates when idle with a stale guide', () => {
    expect(shouldAutoUpdate(input())).toBe(true);
  });

  it('does nothing when switched off', () => {
    expect(shouldAutoUpdate(input({ enabled: false }))).toBe(false);
  });

  it('does nothing while the app is in the background', () => {
    expect(shouldAutoUpdate(input({ appActive: false }))).toBe(false);
  });

  it('does nothing while a guide download or playlist update is running', () => {
    expect(shouldAutoUpdate(input({ busy: true }))).toBe(false);
  });

  it('does nothing while a video is on screen', () => {
    expect(shouldAutoUpdate(input({ videosOnScreen: 1 }))).toBe(false);
    expect(shouldAutoUpdate(input({ videosOnScreen: 2 }))).toBe(false);
  });

  it('does nothing when a video closed less than 30 seconds ago', () => {
    expect(shouldAutoUpdate(input({ lastVideoEndedAt: NOW - 29_999 }))).toBe(false);
    expect(shouldAutoUpdate(input({ lastVideoEndedAt: NOW }))).toBe(false);
  });

  it('updates exactly 30 seconds after a video closed, and later', () => {
    expect(shouldAutoUpdate(input({ lastVideoEndedAt: NOW - IDLE_AFTER_VIDEO_MS }))).toBe(true);
    expect(shouldAutoUpdate(input({ lastVideoEndedAt: NOW - 10 * MIN }))).toBe(true);
  });

  it('updates when no video has closed yet', () => {
    expect(shouldAutoUpdate(input({ lastVideoEndedAt: null }))).toBe(true);
  });

  it('waits after a recent failure and tries again once retryFailedMs has passed', () => {
    expect(shouldAutoUpdate(input({ lastFailureAt: NOW - 10 * MIN }))).toBe(false);
    expect(shouldAutoUpdate(input({ lastFailureAt: NOW - 30 * MIN + 1 }))).toBe(false);
    expect(shouldAutoUpdate(input({ lastFailureAt: NOW - 30 * MIN }))).toBe(true);
    expect(shouldAutoUpdate(input({ lastFailureAt: NOW - 2 * HOUR }))).toBe(true);
  });

  it('updates when no guide is stored', () => {
    expect(shouldAutoUpdate(input({ fetchedAt: null }))).toBe(true);
  });

  it('does nothing while the guide is fresh', () => {
    expect(shouldAutoUpdate(input({ fetchedAt: NOW }))).toBe(false);
    expect(shouldAutoUpdate(input({ fetchedAt: NOW - 24 * HOUR + 1 }))).toBe(false);
  });

  it('updates once the guide is exactly freshMs old, and older', () => {
    expect(shouldAutoUpdate(input({ fetchedAt: NOW - 24 * HOUR }))).toBe(true);
    expect(shouldAutoUpdate(input({ fetchedAt: NOW - 25 * HOUR }))).toBe(true);
  });

  it('does not update with no guide stored when switched off or a video is playing', () => {
    expect(shouldAutoUpdate(input({ fetchedAt: null, enabled: false }))).toBe(false);
    expect(shouldAutoUpdate(input({ fetchedAt: null, videosOnScreen: 1 }))).toBe(false);
  });
});

describe('idleIn', () => {
  it('is 0 when no video has closed yet', () => {
    expect(idleIn(NOW, null)).toBe(0);
  });

  it('counts down to the 30 second mark after a video closed', () => {
    expect(idleIn(NOW, NOW)).toBe(IDLE_AFTER_VIDEO_MS);
    expect(idleIn(NOW, NOW - 10_000)).toBe(20_000);
    expect(idleIn(NOW, NOW - 29_999)).toBe(1);
  });

  it('is 0 at exactly 30 seconds and never negative afterwards', () => {
    expect(idleIn(NOW, NOW - IDLE_AFTER_VIDEO_MS)).toBe(0);
    expect(idleIn(NOW, NOW - 31_000)).toBe(0);
    expect(idleIn(NOW, NOW - HOUR)).toBe(0);
  });
});
