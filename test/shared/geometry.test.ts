import { describe, expect, it } from "vitest";
import { clipToBounds, inflate, intersects, physicalToCss, union } from "../../src/shared/geometry.js";

describe("physicalToCss", () => {
  it("keeps the rect unchanged at 100% scaling", () => {
    expect(physicalToCss({ x: 100, y: 50, w: 300, h: 200 }, 1)).toEqual({ x: 100, y: 50, w: 300, h: 200 });
  });

  it("divides by the scale factor at 150% scaling", () => {
    expect(physicalToCss({ x: 150, y: 300, w: 450, h: 90 }, 1.5)).toEqual({ x: 100, y: 200, w: 300, h: 60 });
  });

  it("subtracts the display origin before scaling", () => {
    expect(physicalToCss({ x: 2120, y: 100, w: 250, h: 125 }, 1.25, { x: 1920, y: 0 })).toEqual({
      x: 160,
      y: 80,
      w: 200,
      h: 100,
    });
  });
});

describe("inflate", () => {
  it("grows the rect by the padding on every side", () => {
    expect(inflate({ x: 10, y: 20, w: 100, h: 50 }, 6)).toEqual({ x: 4, y: 14, w: 112, h: 62 });
  });
});

describe("intersects", () => {
  it("is true for overlapping rects", () => {
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it("is false for rects that only touch at an edge", () => {
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe("clipToBounds", () => {
  const screen = { x: 0, y: 0, w: 1920, h: 1080 };

  it("keeps a rect that is fully inside", () => {
    expect(clipToBounds({ x: 10, y: 10, w: 100, h: 50 }, screen)).toEqual({ x: 10, y: 10, w: 100, h: 50 });
  });

  it("cuts the part that sticks out of the bounds", () => {
    expect(clipToBounds({ x: 1800, y: 1000, w: 300, h: 200 }, screen)).toEqual({ x: 1800, y: 1000, w: 120, h: 80 });
  });

  it("cuts negative origins", () => {
    expect(clipToBounds({ x: -50, y: -20, w: 100, h: 40 }, screen)).toEqual({ x: 0, y: 0, w: 50, h: 20 });
  });

  it("returns null when nothing is left inside", () => {
    expect(clipToBounds({ x: 2000, y: 10, w: 100, h: 50 }, screen)).toBeNull();
    expect(clipToBounds({ x: 1920, y: 10, w: 100, h: 50 }, screen)).toBeNull();
  });
});

describe("union", () => {
  it("returns the bounding box of all rects", () => {
    expect(
      union([
        { x: 10, y: 10, w: 10, h: 10 },
        { x: 50, y: 0, w: 5, h: 40 },
      ]),
    ).toEqual({ x: 10, y: 0, w: 45, h: 40 });
  });

  it("returns null for an empty list", () => {
    expect(union([])).toBeNull();
  });
});
