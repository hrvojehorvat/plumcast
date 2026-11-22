import { describe, expect, it } from 'vitest';
import { createBreather } from './breathe';

describe('createBreather', () => {
  it('pauses only after the budget is used up', async () => {
    let clock = 0;
    let pauses = 0;
    const breathe = createBreather(10, () => clock, async () => {
      pauses++;
    });
    clock = 5;
    await breathe();
    expect(pauses).toBe(0);
    clock = 11;
    await breathe();
    expect(pauses).toBe(1);
    clock = 15;
    await breathe();
    expect(pauses).toBe(1);
    clock = 22;
    await breathe();
    expect(pauses).toBe(2);
  });
});
