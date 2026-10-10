import { describe, expect, it } from "vitest";
import { buildDemoSteps, parseRectArg, parseStepArg } from "../../overlay/demo.js";

describe("parseRectArg", () => {
  it("reads x,y,w,h from --rect=", () => {
    expect(parseRectArg(["electron", "main.cjs", "--rect=10,20,300,40"])).toEqual({ x: 10, y: 20, w: 300, h: 40 });
  });

  it("returns null when the flag is absent", () => {
    expect(parseRectArg(["electron", "main.cjs", "--demo"])).toBeNull();
  });

  it("rejects malformed or non-positive sizes", () => {
    expect(() => parseRectArg(["--rect=10,20,abc,40"])).toThrow(/--rect/);
    expect(() => parseRectArg(["--rect=10,20,0,40"])).toThrow(/--rect/);
  });
});

describe("parseStepArg", () => {
  it("converts the 1-based --step= flag to an index", () => {
    expect(parseStepArg(["--step=4"], 6)).toBe(3);
  });

  it("defaults to the first step", () => {
    expect(parseStepArg([], 6)).toBe(0);
  });

  it("rejects steps outside the walkthrough", () => {
    expect(() => parseStepArg(["--step=7"], 6)).toThrow(/--step/);
    expect(() => parseStepArg(["--step=0"], 6)).toThrow(/--step/);
  });
});

describe("buildDemoSteps", () => {
  const bounds = { x: 0, y: 0, w: 2000, h: 1000 };

  it("starts and ends with a card", () => {
    const steps = buildDemoSteps(bounds);
    expect(steps[0].kind).toBe("card");
    expect(steps.at(-1)!.kind).toBe("card");
  });

  it("covers every step mode", () => {
    const modes = new Set(buildDemoSteps(bounds).map((s) => s.mode));
    expect(modes).toEqual(new Set(["read", "click", "do"]));
  });

  it("keeps every highlight inside the display", () => {
    const shifted = { x: 1920, y: 0, w: 2000, h: 1000 };
    for (const step of buildDemoSteps(shifted)) {
      for (const h of step.highlights) {
        expect(h.x).toBeGreaterThanOrEqual(shifted.x);
        expect(h.x + h.w).toBeLessThanOrEqual(shifted.x + shifted.w);
        expect(h.y + h.h).toBeLessThanOrEqual(shifted.y + shifted.h);
      }
    }
  });
});
