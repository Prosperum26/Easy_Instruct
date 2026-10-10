import type { Point, Rect } from "../shared/geometry.js";

export interface ScreenshotMeta {
  id: string;
  /** Top-left of the captured area in physical screen pixels. */
  origin: Point;
  /** Image pixels per physical pixel (≤ 1). */
  scale: number;
  width: number;
  height: number;
}

/** Remembers the last few screenshots so rects read off them can be mapped back to the screen. */
export class ScreenshotStore {
  private readonly shots = new Map<string, ScreenshotMeta>();
  private counter = 0;

  constructor(private readonly limit = 10) {}

  add(meta: Omit<ScreenshotMeta, "id">): ScreenshotMeta {
    const shot = { ...meta, id: `shot-${++this.counter}` };
    this.shots.set(shot.id, shot);
    while (this.shots.size > this.limit) this.shots.delete(this.shots.keys().next().value!);
    return shot;
  }

  get(id: string): ScreenshotMeta | undefined {
    return this.shots.get(id);
  }
}

/** Maps a rect in screenshot pixels to physical screen pixels, rounding each corner. */
export function screenshotToScreen(rect: Rect, shot: ScreenshotMeta): Rect {
  const left = Math.round(shot.origin.x + rect.x / shot.scale);
  const top = Math.round(shot.origin.y + rect.y / shot.scale);
  const right = Math.round(shot.origin.x + (rect.x + rect.w) / shot.scale);
  const bottom = Math.round(shot.origin.y + (rect.y + rect.h) / shot.scale);
  return { x: left, y: top, w: right - left, h: bottom - top };
}
