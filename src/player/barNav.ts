/** Where a button of the player's action bar sits (from onLayout). */
export interface ButtonRect {
  x: number;
  y: number;
  width: number;
}

/**
 * ▲/▼ inside the action bar when its buttons wrap onto several lines (a TV is narrower than a PC):
 * the button on the line above / below closest to the current one horizontally.
 * Returns null when there is no line in that direction (the key leaves the bar).
 */
export function moveAcrossLines(rects: readonly (ButtonRect | undefined)[], current: number, direction: 'up' | 'down'): number | null {
  const here = rects[current];
  if (!here) return null;
  const lines = [...new Set(rects.filter((r): r is ButtonRect => !!r).map((r) => Math.round(r.y)))].sort((a, b) => a - b);
  const line = lines.indexOf(Math.round(here.y)) + (direction === 'down' ? 1 : -1);
  if (line < 0 || line >= lines.length) return null;
  const centre = here.x + here.width / 2;
  let best: number | null = null;
  let bestDistance = Infinity;
  rects.forEach((r, i) => {
    if (!r || Math.round(r.y) !== lines[line]) return;
    const distance = Math.abs(r.x + r.width / 2 - centre);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}
