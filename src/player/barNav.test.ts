import { describe, expect, it } from 'vitest';
import { moveAcrossLines, type ButtonRect } from './barNav';

// Two lines: four buttons, then two.
const rects: ButtonRect[] = [
  { x: 0, y: 0, width: 100 },
  { x: 110, y: 0, width: 100 },
  { x: 220, y: 0, width: 100 },
  { x: 330, y: 0, width: 100 },
  { x: 0, y: 52, width: 120 },
  { x: 130, y: 52.4, width: 80 },
];

describe('action bar ▲▼', () => {
  it('moves to the closest button on the next line', () => {
    expect(moveAcrossLines(rects, 1, 'down')).toBe(5);
    expect(moveAcrossLines(rects, 0, 'down')).toBe(4);
    expect(moveAcrossLines(rects, 3, 'down')).toBe(5);
    expect(moveAcrossLines(rects, 4, 'up')).toBe(0);
    expect(moveAcrossLines(rects, 5, 'up')).toBe(1);
  });

  it('leaves the bar past the first or last line', () => {
    expect(moveAcrossLines(rects, 2, 'up')).toBeNull();
    expect(moveAcrossLines(rects, 5, 'down')).toBeNull();
    expect(moveAcrossLines(rects.slice(0, 4), 1, 'down')).toBeNull();
  });

  it('copes with buttons not laid out yet', () => {
    expect(moveAcrossLines([], 0, 'down')).toBeNull();
    expect(moveAcrossLines([rects[0], undefined, rects[4]], 0, 'down')).toBe(2);
  });
});
