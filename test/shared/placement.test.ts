import { describe, expect, it } from "vitest";
import { placeBubble } from "../../src/shared/placement.js";

const viewport = { w: 1920, h: 1080 };
const bubble = { w: 360, h: 200 };
const opts = { gap: 16, margin: 12 };

describe("placeBubble", () => {
  it("prefers the right side of the target", () => {
    const target = { x: 100, y: 300, w: 400, h: 150 };
    const p = placeBubble(target, [target], bubble, viewport, opts);
    expect(p.side).toBe("right");
    expect(p.x).toBe(516);
    expect(p.y).toBe(300);
  });

  it("falls back to below when the right side does not fit", () => {
    const target = { x: 1500, y: 100, w: 400, h: 150 };
    const p = placeBubble(target, [target], bubble, viewport, opts);
    expect(p.side).toBe("bottom");
    expect(p.y).toBe(266);
  });

  it("goes left when right and below do not fit", () => {
    const target = { x: 1500, y: 800, w: 400, h: 250 };
    const p = placeBubble(target, [target], bubble, viewport, opts);
    expect(p.side).toBe("left");
    expect(p.x).toBe(1500 - 16 - 360);
  });

  it("clamps the cross axis inside the viewport", () => {
    const target = { x: 100, y: 1000, w: 300, h: 60 };
    const p = placeBubble(target, [target], bubble, viewport, opts);
    expect(p.side).toBe("right");
    expect(p.y).toBe(1080 - 12 - 200);
  });

  it("skips a side whose position would cover another highlight", () => {
    const target = { x: 100, y: 300, w: 400, h: 150 };
    const other = { x: 600, y: 280, w: 300, h: 300 };
    const p = placeBubble(target, [target, other], bubble, viewport, opts);
    expect(p.side).not.toBe("right");
  });

  it("uses the corner farthest from the target when no side fits", () => {
    const target = { x: 0, y: 0, w: 1900, h: 1000 };
    const p = placeBubble(target, [target], bubble, viewport, opts);
    expect(p.side).toBe("none");
    expect(p).toMatchObject({ x: 1920 - 12 - 360, y: 1080 - 12 - 200 });
  });

  it("points the arrow at the target centre along the bubble edge", () => {
    const target = { x: 100, y: 300, w: 400, h: 150 };
    const p = placeBubble(target, [target], bubble, viewport, opts);
    expect(p.arrowOffset).toBe(375 - 300);
  });
});

describe("placeBubble without a target", () => {
  it("centres the bubble as a card", () => {
    const p = placeBubble(null, [], bubble, viewport, opts);
    expect(p).toEqual({ side: "none", x: 780, y: 440, arrowOffset: 0 });
  });
});
