import { describe, expect, it } from "vitest";
import { easeOutCubic, interpolateRects } from "../../overlay/renderer/tween.js";

describe("interpolateRects", () => {
  const from = [{ x: 0, y: 0, w: 100, h: 100 }];
  const to = [{ x: 200, y: 100, w: 300, h: 50 }];

  it("returns the start rects at t = 0", () => {
    expect(interpolateRects(from, to, 0)).toEqual(from);
  });

  it("returns a point between both rects at t = 0.5", () => {
    expect(interpolateRects(from, to, 0.5)).toEqual([{ x: 100, y: 50, w: 200, h: 75 }]);
  });

  it("returns the target rects at t = 1", () => {
    expect(interpolateRects(from, to, 1)).toEqual(to);
  });

  it("jumps straight to the target when the number of rects differs", () => {
    expect(interpolateRects([], to, 0.3)).toEqual(to);
  });
});

describe("easeOutCubic", () => {
  it("maps 0 to 0 and 1 to 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("moves faster at the start than a linear ramp", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
