export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Converts a rect in physical screen pixels to CSS pixels of a display. */
export function physicalToCss(rect: Rect, scaleFactor: number, displayOrigin: Point = { x: 0, y: 0 }): Rect {
  return {
    x: (rect.x - displayOrigin.x) / scaleFactor,
    y: (rect.y - displayOrigin.y) / scaleFactor,
    w: rect.w / scaleFactor,
    h: rect.h / scaleFactor,
  };
}

export function inflate(rect: Rect, padding: number): Rect {
  return { x: rect.x - padding, y: rect.y - padding, w: rect.w + padding * 2, h: rect.h + padding * 2 };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
