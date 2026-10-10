import type { Rect } from "../../src/shared/geometry.js";

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rects part-way from `from` to `to`; jumps to `to` when the two lists differ in length. */
export function interpolateRects(from: Rect[], to: Rect[], t: number): Rect[] {
  if (from.length !== to.length) return to;
  return to.map((target, i) => ({
    x: lerp(from[i].x, target.x, t),
    y: lerp(from[i].y, target.y, t),
    w: lerp(from[i].w, target.w, t),
    h: lerp(from[i].h, target.h, t),
  }));
}
