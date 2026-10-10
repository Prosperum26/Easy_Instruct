import { intersects, type Rect } from "./geometry.js";

export type Side = "right" | "bottom" | "left" | "top" | "none";

export interface Size {
  w: number;
  h: number;
}

export interface Placement {
  side: Side;
  x: number;
  y: number;
  /** Distance from the bubble's top (left/right sides) or left edge (top/bottom sides) to the arrow tip. */
  arrowOffset: number;
}

export interface PlacementOptions {
  /** Space between the target and the bubble. */
  gap: number;
  /** Minimum space between the bubble and the viewport edge. */
  margin: number;
}

const ARROW_INSET = 16;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Picks where the explanation bubble goes: right, below, left, then above the target,
 * taking the first spot that fits on screen and covers no highlight.
 * Without a target the bubble is centred like a card.
 */
export function placeBubble(
  target: Rect | null,
  highlights: Rect[],
  bubble: Size,
  viewport: Size,
  { gap, margin }: PlacementOptions,
): Placement {
  if (!target) {
    return { side: "none", x: (viewport.w - bubble.w) / 2, y: (viewport.h - bubble.h) / 2, arrowOffset: 0 };
  }

  const maxX = viewport.w - margin - bubble.w;
  const maxY = viewport.h - margin - bubble.h;
  const alongY = clamp(target.y, margin, maxY);
  const alongX = clamp(target.x, margin, maxX);

  const candidates: Array<{ side: Side; x: number; y: number }> = [
    { side: "right", x: target.x + target.w + gap, y: alongY },
    { side: "bottom", x: alongX, y: target.y + target.h + gap },
    { side: "left", x: target.x - gap - bubble.w, y: alongY },
    { side: "top", x: alongX, y: target.y - gap - bubble.h },
  ];

  const fits = (c: { x: number; y: number }) => {
    const box = { x: c.x, y: c.y, w: bubble.w, h: bubble.h };
    return c.x >= margin && c.x <= maxX && c.y >= margin && c.y <= maxY && !highlights.some((h) => intersects(box, h));
  };

  const chosen = candidates.find(fits);
  if (chosen) {
    const vertical = chosen.side === "left" || chosen.side === "right";
    const centre = vertical ? target.y + target.h / 2 - chosen.y : target.x + target.w / 2 - chosen.x;
    const length = vertical ? bubble.h : bubble.w;
    return { ...chosen, arrowOffset: clamp(centre, ARROW_INSET, length - ARROW_INSET) };
  }

  return { side: "none", ...farthestCorner(target, bubble, viewport, margin), arrowOffset: 0 };
}

function farthestCorner(target: Rect, bubble: Size, viewport: Size, margin: number) {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const xs = [margin, viewport.w - margin - bubble.w];
  const ys = [margin, viewport.h - margin - bubble.h];
  const corners = xs.flatMap((x) => ys.map((y) => ({ x, y })));
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x + bubble.w / 2 - cx, p.y + bubble.h / 2 - cy);
  return corners.reduce((best, p) => (distance(p) > distance(best) ? p : best));
}
