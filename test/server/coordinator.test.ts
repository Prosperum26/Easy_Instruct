import { beforeEach, describe, expect, it } from "vitest";
import { Coordinator, ToolError } from "../../src/server/coordinator.js";
import { FakeHelper } from "../helpers/fake-helper.js";
import { FakeOverlayHandle } from "../helpers/fake-overlay-handle.js";

const rect = (x: number, y: number, w: number, h: number) => ({ kind: "rect" as const, x, y, w, h });

describe("Coordinator", () => {
  let overlays: FakeOverlayHandle[];
  let failLaunches: number;
  let coordinator: Coordinator;
  const overlay = () => overlays.at(-1)!;

  beforeEach(() => {
    overlays = [];
    failLaunches = 0;
    coordinator = new Coordinator({
      launch: async () => {
        if (failLaunches > 0) {
          failLaunches--;
          throw new Error("electron missing");
        }
        const handle = new FakeOverlayHandle();
        overlays.push(handle);
        return handle;
      },
    });
  });

  const start = () => coordinator.startSession({ title: "Repo tour", intro: "Xin chào" });
  const expectCode = async (promise: Promise<unknown>, code: string) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ToolError);
    expect((error as ToolError).code).toBe(code);
  };

  describe("startSession", () => {
    it("launches the overlay and shows the intro card", async () => {
      await start();
      const render = overlay().lastRender();
      expect(render).toMatchObject({ kind: "card", title: "Repo tour", bodyMd: "Xin chào" });
      expect(render.buttons).toEqual(["exit", "start"]);
    });

    it("refuses a second session while one is running", async () => {
      await start();
      await expectCode(start(), "SESSION_ACTIVE");
    });

    it("refuses a second start while the first is still launching", async () => {
      const first = start();
      await expectCode(start(), "SESSION_ACTIVE");
      await first;
    });

    it("reports launch failures and allows a retry", async () => {
      failLaunches = 1;
      await expectCode(start(), "LAUNCH_FAILED");
      await expect(start()).resolves.toBeDefined();
    });

    it("replaces a session that is only showing its summary", async () => {
      await start();
      await coordinator.endSession({ summary: "xong" });
      const old = overlay();
      await start();
      expect(old.stopped).toBe(true);
      expect(overlays).toHaveLength(2);
    });
  });

  describe("showStep", () => {
    it("needs a session", async () => {
      await expectCode(coordinator.showStep({ title: "A", body: "b", targets: [], mode: "read" }), "NO_SESSION");
    });

    it("draws rect targets and reports them as resolved", async () => {
      await start();
      const result = await coordinator.showStep({
        title: "Explorer",
        body: "Cây thư mục",
        targets: [rect(10, 20, 300, 400)],
        mode: "read",
        label: "1/5",
      });
      expect(result.resolved).toEqual([{ rect: { x: 10, y: 20, w: 300, h: 400 }, method: "explicit", confidence: 1 }]);
      expect(result.unresolved).toEqual([]);
      expect(overlay().lastRender()).toMatchObject({
        stepId: result.stepId,
        kind: "bubble",
        label: "1/5",
        highlights: [{ x: 10, y: 20, w: 300, h: 400 }],
        buttons: ["back", "ask", "next"],
      });
    });

    it("clips rects that stick out of the display", async () => {
      await start();
      const result = await coordinator.showStep({ title: "A", body: "b", targets: [rect(1800, 1000, 400, 200)], mode: "read" });
      expect(result.resolved[0].rect).toEqual({ x: 1800, y: 1000, w: 120, h: 80 });
    });

    it("clips against the latest display reported by the overlay", async () => {
      await start();
      overlay().display = { scaleFactor: 1.5, boundsPhysical: { x: 0, y: 0, w: 1280, h: 720 } };
      const result = await coordinator.showStep({ title: "A", body: "b", targets: [rect(1200, 10, 200, 50)], mode: "read" });
      expect(result.resolved[0].rect).toEqual({ x: 1200, y: 10, w: 80, h: 50 });
    });

    it("falls back to a card when no target is on screen", async () => {
      await start();
      const result = await coordinator.showStep({ title: "A", body: "b", targets: [rect(5000, 10, 100, 50)], mode: "read" });
      expect(result.unresolved).toEqual([{ target: rect(5000, 10, 100, 50), reason: "off_screen" }]);
      expect(overlay().lastRender()).toMatchObject({ kind: "card", highlights: [] });
    });

    it("shows a card without complaint for a none target", async () => {
      await start();
      const result = await coordinator.showStep({ title: "A", body: "b", targets: [{ kind: "none" }], mode: "read" });
      expect(result.unresolved).toEqual([]);
      expect(overlay().lastRender().kind).toBe("card");
    });

    it("picks the buttons from the step mode", async () => {
      await start();
      await coordinator.showStep({ title: "A", body: "b", targets: [], mode: "do" });
      expect(overlay().lastRender().buttons).toEqual(["back", "ask", "done"]);
      await coordinator.showStep({ title: "B", body: "b", targets: [], mode: "click" });
      expect(overlay().lastRender().buttons).toEqual(["back", "ask", "skip"]);
    });
  });

  describe("showCard", () => {
    it("shows a centred card with next", async () => {
      await start();
      const { stepId } = await coordinator.showCard({ title: "Tổng quan", body: "FastAPI app" });
      expect(overlay().lastRender()).toMatchObject({ stepId, kind: "card", highlights: [], buttons: ["back", "ask", "next"] });
    });
  });

  describe("waitForUser", () => {
    it("needs a session", async () => {
      await expectCode(coordinator.waitForUser({ timeoutSec: 1 }), "NO_SESSION");
    });

    it("returns next when the user starts the lesson", async () => {
      await start();
      const waiting = coordinator.waitForUser({ timeoutSec: 5 });
      overlay().press("start");
      await expect(waiting).resolves.toEqual({ event: "next", step_id: "s1" });
    });

    it("shows a waiting status after the user finishes a step", async () => {
      await start();
      overlay().press("start");
      expect(overlay().lastStatus()).toBe("Đang chờ AI…");
      await coordinator.showStep({ title: "A", body: "b", targets: [], mode: "read" });
      expect(overlay().lastStatus()).toBeNull();
    });

    it("returns questions", async () => {
      await start();
      overlay().ask("Repo này dùng gì?");
      await expect(coordinator.waitForUser({ timeoutSec: 5 })).resolves.toEqual({
        event: "ask",
        step_id: "s1",
        question: "Repo này dùng gì?",
      });
    });

    it("times out", async () => {
      await start();
      await expect(coordinator.waitForUser({ timeoutSec: 0.05 })).resolves.toEqual({ event: "timeout" });
    });

    it("refuses a second concurrent wait", async () => {
      await start();
      const first = coordinator.waitForUser({ timeoutSec: 0.2 });
      await expectCode(coordinator.waitForUser({ timeoutSec: 1 }), "WAIT_IN_PROGRESS");
      await first;
    });
  });

  describe("user exit", () => {
    it("stops the overlay, reports exit once, then has no session", async () => {
      await start();
      overlay().press("exit");
      await coordinator.idle();
      expect(overlay().stopped).toBe(true);
      await expect(coordinator.waitForUser({ timeoutSec: 1 })).resolves.toEqual({
        event: "exit",
        step_id: "s1",
        reason: "user",
      });
      await expectCode(coordinator.waitForUser({ timeoutSec: 1 }), "NO_SESSION");
      await expectCode(coordinator.showStep({ title: "A", body: "b", targets: [], mode: "read" }), "NO_SESSION");
    });

    it("wakes a pending wait", async () => {
      await start();
      const waiting = coordinator.waitForUser({ timeoutSec: 5 });
      overlay().press("exit");
      await expect(waiting).resolves.toMatchObject({ event: "exit", reason: "user" });
    });

    it("allows a new session afterwards", async () => {
      await start();
      overlay().press("exit");
      await expect(start()).resolves.toBeDefined();
    });
  });

  describe("endSession", () => {
    it("needs a session", async () => {
      await expectCode(coordinator.endSession({ summary: "x" }), "NO_SESSION");
    });

    it("shows the summary and closes when the user closes it", async () => {
      await start();
      await coordinator.endSession({ summary: "Bạn đã học xong" });
      expect(overlay().lastRender()).toMatchObject({ kind: "card", bodyMd: "Bạn đã học xong", buttons: ["close"] });
      overlay().press("close");
      await coordinator.idle();
      expect(overlay().stopped).toBe(true);
    });

    it("makes further step calls fail", async () => {
      await start();
      await coordinator.endSession({ summary: "x" });
      await expectCode(coordinator.showStep({ title: "A", body: "b", targets: [], mode: "read" }), "NO_SESSION");
    });
  });

  describe("overlay crashes", () => {
    it("restarts the overlay once and redraws the current step", async () => {
      await start();
      await coordinator.showStep({ title: "Step A", body: "b", targets: [rect(1, 2, 3, 4)], mode: "read" });
      overlay().crash();
      await coordinator.idle();
      expect(overlays).toHaveLength(2);
      expect(overlay().lastRender()).toMatchObject({ title: "Step A", highlights: [{ x: 1, y: 2, w: 3, h: 4 }] });
    });

    it("gives up after a second crash and reports it", async () => {
      await start();
      overlay().crash();
      await coordinator.idle();
      overlay().crash();
      await coordinator.idle();
      expect(overlays).toHaveLength(2);
      await expect(coordinator.waitForUser({ timeoutSec: 1 })).resolves.toEqual({
        event: "exit",
        step_id: "s1",
        reason: "overlay_crashed",
      });
    });

    it("reports a crash when the restart itself fails", async () => {
      await start();
      failLaunches = 1;
      overlay().crash();
      await coordinator.idle();
      await expect(coordinator.waitForUser({ timeoutSec: 1 })).resolves.toMatchObject({ reason: "overlay_crashed" });
    });

    it("does not restart an overlay it stopped itself", async () => {
      await start();
      overlay().press("exit");
      await coordinator.idle();
      expect(overlays).toHaveLength(1);
    });
  });
});

describe("Coordinator with win-helper", () => {
  let overlay: FakeOverlayHandle;
  let helper: FakeHelper;
  let coordinator: Coordinator;

  beforeEach(() => {
    helper = new FakeHelper();
    coordinator = new Coordinator({ launch: async () => (overlay = new FakeOverlayHandle()), helper });
  });

  const expectCode = async (promise: Promise<unknown>, code: string) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ToolError);
    expect((error as ToolError).code).toBe(code);
  };

  describe("startSession", () => {
    it("finds the VS Code window of the workspace", async () => {
      helper.windows.unshift({ ...helper.windows[0], hwnd: 7, title: "x.ts - other - Visual Studio Code" });
      const result = await coordinator.startSession({ title: "T", intro: "i", workspace: "C:/repos/fastapi-demo" });
      expect(result.ideWindow).toEqual({
        title: "main.py - fastapi-demo - Visual Studio Code",
        bounds: helper.windows[1].bounds,
        minimized: false,
      });
    });

    it("says when the VS Code window is minimized instead of passing its off-screen bounds", async () => {
      helper.windows[0] = { ...helper.windows[0], minimized: true, bounds: { x: -32000, y: -32000, w: 160, h: 28 } };
      const result = await coordinator.startSession({ title: "T", intro: "i" });
      expect(result.ideWindow).toEqual({ title: helper.windows[0].title, bounds: null, minimized: true });
    });

    it("still starts when VS Code is not found", async () => {
      helper.windows = [];
      await expect(coordinator.startSession({ title: "T", intro: "i" })).resolves.toMatchObject({ ideWindow: null });
    });

    it("still starts when the helper is unavailable", async () => {
      helper.unavailable = true;
      await expect(coordinator.startSession({ title: "T", intro: "i" })).resolves.toMatchObject({ ideWindow: null });
    });
  });

  describe("observe", () => {
    it("captures the IDE window with a grid by default", async () => {
      await coordinator.startSession({ title: "T", intro: "i" });
      const shot = await coordinator.observe({});
      expect(helper.callsTo("capture").at(-1)?.args).toEqual({ x: 0, y: 0, w: 1920, h: 1020, grid: true, maxWidth: 1600 });
      expect(shot.meta).toMatchObject({
        source: "ide",
        window_title: "main.py - fastapi-demo - Visual Studio Code",
        origin: { x: 0, y: 0 },
        width: 1600,
        height: 850,
      });
      expect(shot.meta.screenshot_id).toMatch(/^shot-/);
      expect(shot.png).toBe("iVBORw0KGgo=");
    });

    it("works before a lesson starts, so the agent can plan", async () => {
      const shot = await coordinator.observe({});
      expect(shot.meta.source).toBe("ide");
    });

    it("re-reads the window bounds each time", async () => {
      await coordinator.startSession({ title: "T", intro: "i" });
      helper.windows[0].bounds = { x: 100, y: 50, w: 800, h: 600 };
      const shot = await coordinator.observe({});
      expect(shot.meta.origin).toEqual({ x: 100, y: 50 });
    });

    it("clips a window that hangs off the screen", async () => {
      helper.windows[0].bounds = { x: -8, y: -8, w: 1936, h: 1036 };
      await coordinator.observe({});
      expect(helper.callsTo("capture").at(-1)?.args).toMatchObject({ x: 0, y: 0, w: 1920, h: 1028 });
    });

    it("falls back to the whole screen when VS Code is minimized or closed", async () => {
      helper.windows[0].minimized = true;
      expect((await coordinator.observe({})).meta).toMatchObject({ source: "screen", note: "VS Code is minimized." });
      helper.windows = [];
      expect((await coordinator.observe({})).meta.source).toBe("screen");
    });

    it("captures the whole screen or an explicit region on request", async () => {
      expect((await coordinator.observe({ region: "screen" })).meta).toMatchObject({ source: "screen", width: 1600 });
      const region = await coordinator.observe({ region: { x: 100, y: 100, w: 400, h: 300 }, grid: false, maxWidth: 800 });
      expect(region.meta).toMatchObject({ source: "region", origin: { x: 100, y: 100 }, width: 400 });
      expect(helper.callsTo("capture").at(-1)?.args).toMatchObject({ grid: false, maxWidth: 800 });
    });

    it("rejects a region entirely off screen", async () => {
      await expectCode(coordinator.observe({ region: { x: 5000, y: 0, w: 10, h: 10 } }), "BAD_REGION");
    });

    it("reports a missing helper", async () => {
      helper.unavailable = true;
      await expectCode(coordinator.observe({}), "HELPER_UNAVAILABLE");
      const noHelper = new Coordinator({ launch: async () => new FakeOverlayHandle() });
      await expectCode(noHelper.observe({}), "HELPER_UNAVAILABLE");
    });
  });

  describe("screenshot-space targets", () => {
    it("maps rects read off a screenshot back to the screen", async () => {
      await coordinator.startSession({ title: "T", intro: "i" });
      const shot = await coordinator.observe({}); // 1920 wide -> 1600, scale 5/6
      const result = await coordinator.showStep({
        title: "A",
        body: "b",
        mode: "read",
        targets: [{ kind: "rect", x: 100, y: 50, w: 250, h: 25, space: "screenshot", screenshotId: shot.meta.screenshot_id }],
      });
      expect(result.resolved[0].rect).toEqual({ x: 120, y: 60, w: 300, h: 30 });
    });

    it("reports unknown screenshot ids as unresolved", async () => {
      await coordinator.startSession({ title: "T", intro: "i" });
      const target = { kind: "rect" as const, x: 1, y: 1, w: 5, h: 5, space: "screenshot" as const, screenshotId: "shot-404" };
      const result = await coordinator.showStep({ title: "A", body: "b", mode: "read", targets: [target] });
      expect(result.unresolved).toEqual([{ target, reason: "unknown_screenshot" }]);
    });
  });

  describe("keyboard focus", () => {
    it("gives focus back to VS Code when the ask form closes", async () => {
      await coordinator.startSession({ title: "T", intro: "i" });
      overlay.release();
      await coordinator.idle();
      expect(helper.callsTo("focus_window")).toEqual([{ cmd: "focus_window", args: { hwnd: 42 } }]);
    });

    it("does nothing without a known VS Code window", async () => {
      helper.windows = [];
      await coordinator.startSession({ title: "T", intro: "i" });
      overlay.release();
      await coordinator.idle();
      expect(helper.callsTo("focus_window")).toEqual([]);
    });

    it("ignores focus failures", async () => {
      await coordinator.startSession({ title: "T", intro: "i" });
      helper.unavailable = true;
      overlay.release();
      await expect(coordinator.idle()).resolves.toBeUndefined();
    });
  });
});
