import { describe, expect, it } from "vitest";
import { ScreenshotStore, screenshotToScreen } from "../../src/observer/screenshots.js";

const meta = { origin: { x: 0, y: 0 }, scale: 1, width: 100, height: 100 };

describe("ScreenshotStore", () => {
  it("gives each screenshot a new id and finds it again", () => {
    const store = new ScreenshotStore();
    const a = store.add(meta);
    const b = store.add({ ...meta, scale: 0.5 });
    expect(a.id).not.toBe(b.id);
    expect(store.get(b.id)?.scale).toBe(0.5);
  });

  it("forgets the oldest screenshots beyond the limit", () => {
    const store = new ScreenshotStore(2);
    const first = store.add(meta);
    store.add(meta);
    store.add(meta);
    expect(store.get(first.id)).toBeUndefined();
  });

  it("returns undefined for unknown ids", () => {
    expect(new ScreenshotStore().get("shot-999")).toBeUndefined();
  });
});

describe("screenshotToScreen", () => {
  it("undoes the down-scaling and adds the capture origin", () => {
    const shot = { id: "shot-1", origin: { x: 100, y: 50 }, scale: 0.8, width: 1280, height: 720 };
    expect(screenshotToScreen({ x: 80, y: 40, w: 160, h: 24 }, shot)).toEqual({ x: 200, y: 100, w: 200, h: 30 });
  });

  it("rounds to whole physical pixels", () => {
    const shot = { id: "shot-1", origin: { x: 0, y: 0 }, scale: 0.75, width: 900, height: 600 };
    expect(screenshotToScreen({ x: 10, y: 10, w: 10, h: 10 }, shot)).toEqual({ x: 13, y: 13, w: 14, h: 14 });
  });
});
