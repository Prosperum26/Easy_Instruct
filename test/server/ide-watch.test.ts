import { describe, expect, it } from "vitest";
import { IdeWatch, type IdeSample } from "../../src/server/ide-watch.js";

const HOME = { x: 0, y: 0, w: 1920, h: 1020 };
const IDE = 42;
const sample = (overrides: Partial<IdeSample> = {}): IdeSample => ({
  bounds: HOME,
  minimized: false,
  foregroundHwnd: IDE,
  foregroundProcess: "Code",
  ...overrides,
});

describe("IdeWatch", () => {
  it("stays quiet while nothing changes", () => {
    const watch = new IdeWatch(IDE, HOME);
    expect(watch.sample(sample())).toEqual([]);
    expect(watch.sample(sample())).toEqual([]);
  });

  describe("moves and resizes", () => {
    const moved = { x: 100, y: 50, w: 1600, h: 900 };

    it("reports a new position once it holds for two samples", () => {
      const watch = new IdeWatch(IDE, HOME);
      expect(watch.sample(sample({ bounds: moved }))).toEqual([]);
      expect(watch.sample(sample({ bounds: moved }))).toEqual([{ type: "moved", from: HOME, to: moved }]);
      expect(watch.sample(sample({ bounds: moved }))).toEqual([]);
    });

    it("waits while the window is being dragged", () => {
      const watch = new IdeWatch(IDE, HOME);
      expect(watch.sample(sample({ bounds: { ...moved, x: 10 } }))).toEqual([]);
      expect(watch.sample(sample({ bounds: { ...moved, x: 20 } }))).toEqual([]);
      expect(watch.sample(sample({ bounds: { ...moved, x: 30 } }))).toEqual([]);
      expect(watch.sample(sample({ bounds: { ...moved, x: 30 } }))).toEqual([
        { type: "moved", from: HOME, to: { ...moved, x: 30 } },
      ]);
    });

    it("ignores a window dragged away and back", () => {
      const watch = new IdeWatch(IDE, HOME);
      watch.sample(sample({ bounds: moved }));
      expect(watch.sample(sample())).toEqual([]);
      expect(watch.sample(sample())).toEqual([]);
    });
  });

  describe("visibility", () => {
    it("hides at once when VS Code is minimized and ignores its off-screen bounds", () => {
      const watch = new IdeWatch(IDE, HOME);
      const offScreen = { x: -32000, y: -32000, w: 160, h: 28 };
      expect(watch.sample(sample({ minimized: true, bounds: offScreen }))).toEqual([{ type: "visibility", visible: false }]);
      expect(watch.sample(sample({ minimized: true, bounds: offScreen }))).toEqual([]);
      expect(watch.sample(sample())).toEqual([{ type: "visibility", visible: true }]);
    });

    it("hides after another app stays in front for two samples, shows again at once", () => {
      const watch = new IdeWatch(IDE, HOME);
      const browser = sample({ foregroundHwnd: 7, foregroundProcess: "chrome" });
      expect(watch.sample(browser)).toEqual([]);
      expect(watch.sample(browser)).toEqual([{ type: "visibility", visible: false }]);
      expect(watch.sample(browser)).toEqual([]);
      expect(watch.sample(sample())).toEqual([{ type: "visibility", visible: true }]);
    });

    it("does not hide for a quick Alt+Tab through another app", () => {
      const watch = new IdeWatch(IDE, HOME);
      watch.sample(sample({ foregroundHwnd: 7, foregroundProcess: "chrome" }));
      expect(watch.sample(sample())).toEqual([]);
      expect(watch.sample(sample({ foregroundHwnd: 7, foregroundProcess: "chrome" }))).toEqual([]);
    });

    it("stays visible while the overlay itself has focus (typing a question)", () => {
      const watch = new IdeWatch(IDE, HOME);
      const overlay = sample({ foregroundHwnd: 99, foregroundProcess: "electron" });
      watch.sample(overlay);
      expect(watch.sample(overlay)).toEqual([]);
    });

    it("treats no foreground window (mid-switch) as no change", () => {
      const watch = new IdeWatch(IDE, HOME);
      const none = sample({ foregroundHwnd: null, foregroundProcess: null });
      watch.sample(none);
      expect(watch.sample(none)).toEqual([]);
    });
  });

  it("reports a closed window once and hides", () => {
    const watch = new IdeWatch(IDE, HOME);
    expect(watch.sample(sample({ bounds: null }))).toEqual([{ type: "gone" }, { type: "visibility", visible: false }]);
    expect(watch.sample(sample({ bounds: null }))).toEqual([]);
  });
});
