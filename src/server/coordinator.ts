import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { HelperError } from "../helper-client/helper-client.js";
import { chooseIdeWindow, type WindowInfo } from "../ide/windows.js";
import { Locator, OpenFileError, type LocateFailure, type SmartTarget } from "../locator/locator.js";
import { ScreenshotStore, screenshotToScreen } from "../observer/screenshots.js";
import { clipToBounds, inflate, union, type Point, type Rect } from "../shared/geometry.js";
import type { ButtonId, DisplayInfo, OverlayToServer, ServerToOverlay, StepMode } from "../shared/protocol.js";
import { Session, type Effects, type StepInput } from "../session/session.js";
import { EventWaiter, WaitInProgressError } from "../session/waiter.js";
import { IdeWatch } from "./ide-watch.js";

/** What the coordinator needs from a running overlay. */
export interface OverlayLink {
  display(): DisplayInfo;
  send(message: ServerToOverlay): void;
  onMessage(listener: (message: OverlayToServer) => void): void;
}

export interface OverlayHandle {
  connection: OverlayLink;
  onExit(listener: (code: number | null) => void): void;
  stop(): Promise<void>;
}

import type { Helper } from "../helper-client/helper.js";
export type { Helper };

/** Codes tools return in isError results; each one is explained in skills/easy-instruct/references/recovery.md. */
export const TOOL_ERROR_CODES = [
  "NO_SESSION",
  "SESSION_ACTIVE",
  "LAUNCH_FAILED",
  "WAIT_IN_PROGRESS",
  "HELPER_UNAVAILABLE",
  "CAPTURE_FAILED",
  "BAD_REGION",
  "FILE_NOT_FOUND",
  "IDE_CLI_NOT_FOUND",
  "IDE_CLI_FAILED",
] as const;

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

/** Reasons show_step reports for explicit rects, besides the locator's. */
export const RECT_FAILURES = ["off_screen", "unknown_screenshot"] as const;

/** Events wait_for_user can return. */
export const WAIT_EVENTS = ["next", "clicked", "skip", "done", "ask", "timeout", "exit"] as const;

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Target =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      /** "screen" (default): physical screen pixels. "screenshot": pixels of the image with screenshotId. */
      space?: "screen" | "screenshot";
      screenshotId?: string;
    }
  | { kind: "none" }
  | SmartTarget;

export interface ResolvedTarget {
  rect: Rect;
  /** explicit: a rect from the agent; uia / ocr / ocr_gutter: found on screen. */
  method: "explicit" | "uia" | "ocr" | "ocr_gutter";
  confidence: number;
  detail?: "view" | "icon";
  clipped?: boolean;
}

export interface UnresolvedTarget {
  target: Target;
  reason: (typeof RECT_FAILURES)[number] | LocateFailure;
}

export interface CoordinatorDeps {
  launch: () => Promise<OverlayHandle>;
  helper?: Helper;
  /** Opens a file at a line in the IDE whose executable is exePath (VS Code CLI); throws OpenFileError. */
  openFile?: (file: string, line: number, column: number, exePath?: string) => Promise<void>;
  fileExists?: (file: string) => boolean;
  sleep?: (ms: number) => Promise<void>;
  /** How often the IDE window is checked for moves and focus (default 500 ms; 0: only when checkIde is called). */
  watchIntervalMs?: number;
}

/** A step's targets and where each one currently is, so they can be re-located later. */
type Placed = Array<{ target: Target; rect: Rect | null }>;

/** A click this close outside a highlight still counts (physical pixels; the drawn border has padding). */
const CLICK_TOLERANCE = 8;

/** Room around the highlights in a verify preview, so the agent sees what they sit in. */
const PREVIEW_MARGIN = 80;
const PREVIEW_MAX_WIDTH = 1000;

export interface IdeWindowSummary {
  title: string;
  /** Null while minimized: Windows then reports meaningless off-screen bounds. */
  bounds: Rect | null;
  minimized: boolean;
}

export interface ObserveMeta {
  screenshot_id: string;
  source: "ide" | "screen" | "region";
  origin: Point;
  scale: number;
  width: number;
  height: number;
  window_title?: string;
  note?: string;
}

interface CaptureResult {
  png: string;
  width: number;
  height: number;
  scale: number;
  origin: Point;
}

export type WaitOutput =
  | { event: "timeout" }
  | { event: "next" | "done" | "skip" | "clicked"; step_id: string }
  | { event: "ask"; step_id: string; question: string }
  | { event: "exit"; step_id: string | null; reason: string };

const MODE_BUTTONS: Record<StepMode, ButtonId[]> = {
  read: ["ask", "next"],
  click: ["ask", "skip"],
  do: ["ask", "done"],
};

const MAX_OVERLAY_RESTARTS = 1;

/**
 * Runs one lesson at a time: owns the Session, the wait_for_user waiter and the overlay
 * process, applies the session's effects to the overlay, and restarts a crashed overlay once.
 */
export class Coordinator {
  private session: Session | null = null;
  private waiter: EventWaiter | null = null;
  private overlay: OverlayHandle | null = null;
  private readonly stoppedByUs = new WeakSet<OverlayHandle>();
  private starting = false;
  private restarts = 0;
  private background: Promise<void> = Promise.resolve();
  private ide: { hwnd: number; title: string; path?: string } | null = null;
  private workspace: string | undefined;
  private readonly screenshots = new ScreenshotStore();
  private readonly locator: Locator | null;
  private watchingClicks = false;
  private readonly placed = new Map<string, Placed>();
  /** Steps whose described targets may be out of date since the window moved; re-located when shown. */
  private readonly stale = new Set<string>();
  private ideWatch: IdeWatch | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private checking = false;
  private overlayHidden = false;

  constructor(private readonly deps: CoordinatorDeps) {
    this.locator = deps.helper
      ? new Locator({
          helper: deps.helper,
          openFile: (file, line) => this.openInIde(file, line, 1),
          fileExists: (file) => this.fileExists(file),
          sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
        })
      : null;
    deps.helper?.onEvent?.((event) => {
      if (event.event === "click") this.onScreenClick(Number(event.x), Number(event.y));
    });
  }

  async startSession({
    title,
    intro,
    workspace,
  }: {
    title: string;
    intro: string;
    /** The repo folder, used to pick the right VS Code window. */
    workspace?: string;
  }): Promise<{ sessionId: string; ideWindow: IdeWindowSummary | null }> {
    if (this.starting || this.session?.phase === "active") {
      throw new ToolError("SESSION_ACTIVE", "A lesson is already running. Call end_session first.");
    }
    this.starting = true;
    try {
      // A previous lesson may still be showing its summary card.
      await this.stopOverlay();
      this.session = null;
      this.waiter = null;

      let handle: OverlayHandle;
      try {
        handle = await this.deps.launch();
      } catch (error) {
        throw new ToolError("LAUNCH_FAILED", `Could not start the overlay: ${(error as Error).message}`);
      }

      this.workspace = workspace;
      const ide = await this.findIde(workspace);
      this.ide = ide && { hwnd: ide.hwnd, title: ide.title, path: ide.path || undefined };
      this.placed.clear();
      this.stale.clear();
      if (ide) {
        this.warmUp(ide.hwnd);
        this.startIdeWatch(ide.minimized ? null : ide.bounds);
      }

      const session = new Session();
      this.session = session;
      this.waiter = new EventWaiter(() => session.takeEvent());
      this.restarts = 0;
      this.attach(handle);
      this.apply(
        session.showStep({ kind: "card", title, bodyMd: intro, mode: "read", highlights: [], actionButtons: ["exit", "start"] }),
      );
      return {
        sessionId: randomUUID(),
        ideWindow: ide && { title: ide.title, bounds: ide.minimized ? null : ide.bounds, minimized: ide.minimized },
      };
    } finally {
      this.starting = false;
    }
  }

  async showStep(input: {
    title: string;
    body: string;
    targets: Target[];
    mode: StepMode;
    label?: string;
    /** Also return a screenshot of the area with the highlights outlined. */
    verify?: boolean;
  }): Promise<{
    stepId: string;
    resolved: ResolvedTarget[];
    unresolved: UnresolvedTarget[];
    preview?: { png: string; meta: ObserveMeta };
  }> {
    const session = this.requireActive();
    const bounds = this.overlay?.connection.display().boundsPhysical;
    const results = await this.resolveTargets(input.targets);
    const resolved: ResolvedTarget[] = [];
    const unresolved: UnresolvedTarget[] = [];

    input.targets.forEach((target, i) => {
      const result = results[i];
      if (result === null) return;
      if ("reason" in result) return unresolved.push({ target, reason: result.reason });
      const clipped = bounds ? clipToBounds(result.rect, bounds) : result.rect;
      if (clipped) resolved.push({ ...result, rect: clipped });
      else unresolved.push({ target, reason: "off_screen" });
    });

    const highlights = resolved.map((r) => r.rect);
    const step: StepInput = {
      kind: highlights.length ? "bubble" : "card",
      title: input.title,
      bodyMd: input.body,
      label: input.label,
      mode: input.mode,
      highlights,
      actionButtons: MODE_BUTTONS[input.mode],
    };
    const effects = session.showStep(step);
    this.placed.set(
      effects.render.stepId,
      input.targets
        .filter((t) => t.kind !== "none")
        .map((target) => {
          const result = results[input.targets.indexOf(target)];
          return { target, rect: result && "rect" in result ? result.rect : null };
        }),
    );
    this.apply(effects);
    this.bringIdeForward();
    const preview = input.verify && highlights.length ? await this.preview(highlights) : undefined;
    return { stepId: effects.render.stepId, resolved, unresolved, ...(preview && { preview }) };
  }

  /**
   * Opens a file at a line in VS Code (relative paths are inside the lesson's workspace). Not a
   * hands-on step: it brings code on screen so a lesson can talk about it.
   */
  async openLocation({ file, line, column = 1 }: { file: string; line: number; column?: number }): Promise<{ file: string; line: number }> {
    const absolute = this.resolvePath(file);
    if (!absolute || !this.fileExists(absolute)) throw new ToolError("FILE_NOT_FOUND", `No such file: ${file}`);
    if (!this.ide) await this.refreshIde();
    try {
      await this.openInIde(absolute, line, column);
    } catch (error) {
      if (!(error instanceof OpenFileError)) throw error;
      throw new ToolError(error.reason === "ide_cli_not_found" ? "IDE_CLI_NOT_FOUND" : "IDE_CLI_FAILED", error.message);
    }
    return { file: absolute, line };
  }

  /** Explicit rects become screen rects; ui / text / lines targets go through the locator. Null: nothing to draw. */
  private async resolveTargets(targets: Target[], options: { reveal?: boolean } = {}) {
    type Result = { rect: Rect; method: ResolvedTarget["method"]; confidence: number; detail?: "view" | "icon"; clipped?: boolean };
    const results: Array<Result | { reason: UnresolvedTarget["reason"] } | null> = targets.map(() => null);
    const smart: Array<{ index: number; target: SmartTarget }> = [];

    targets.forEach((target, i) => {
      if (target.kind === "none") return;
      if (target.kind !== "rect") return smart.push({ index: i, target });
      let rect: Rect = { x: target.x, y: target.y, w: target.w, h: target.h };
      if (target.space === "screenshot") {
        const shot = target.screenshotId ? this.screenshots.get(target.screenshotId) : undefined;
        if (!shot) return (results[i] = { reason: "unknown_screenshot" });
        rect = screenshotToScreen(rect, shot);
      }
      results[i] = { rect, method: "explicit", confidence: 1 };
    });

    if (smart.length) {
      if (!this.locator) {
        smart.forEach(({ index }) => (results[index] = { reason: "helper_unavailable" }));
      } else {
        if (!this.ide) await this.refreshIde();
        const ide = this.ide && { hwnd: this.ide.hwnd, workspace: this.workspace };
        const located = await this.locator.locate(
          smart.map((s) => s.target),
          ide,
          options,
        );
        smart.forEach(({ index }, k) => (results[index] = located[k]));
      }
    }
    return results;
  }

  private async preview(highlights: Rect[]): Promise<{ png: string; meta: ObserveMeta } | undefined> {
    if (!this.deps.helper) return undefined;
    try {
      const display = (await this.deps.helper.request<{ bounds: Rect }>("display_info")).bounds;
      const area = clipToBounds(inflate(union(highlights)!, PREVIEW_MARGIN), display);
      if (!area) return undefined;
      return await this.capture(area, "region", {
        grid: false,
        maxWidth: PREVIEW_MAX_WIDTH,
        boxes: highlights.map((r) => [r.x, r.y, r.w, r.h]),
      });
    } catch (error) {
      if (error instanceof HelperError) return undefined; // The step is shown either way.
      throw error;
    }
  }

  async showCard({ title, body, label }: { title: string; body: string; label?: string }): Promise<{ stepId: string }> {
    const session = this.requireActive();
    const effects = session.showStep({
      kind: "card",
      title,
      bodyMd: body,
      label,
      mode: "read",
      highlights: [],
      actionButtons: MODE_BUTTONS.read,
    });
    this.apply(effects);
    this.bringIdeForward();
    return { stepId: effects.render.stepId };
  }

  async waitForUser({ timeoutSec, signal }: { timeoutSec: number; signal?: AbortSignal }): Promise<WaitOutput> {
    const session = this.session;
    const waiter = this.waiter;
    if (!session || !waiter || (session.phase !== "active" && !session.hasEvents())) {
      throw new ToolError("NO_SESSION", "No lesson is running. Call start_session first.");
    }

    let result;
    try {
      result = await waiter.wait(timeoutSec * 1000, signal);
    } catch (error) {
      if (error instanceof WaitInProgressError) throw new ToolError("WAIT_IN_PROGRESS", error.message);
      throw error;
    }

    switch (result.event) {
      case "timeout":
        return { event: "timeout" };
      case "ask":
        return { event: "ask", step_id: result.stepId, question: result.question };
      case "exit":
        return { event: "exit", step_id: result.stepId, reason: result.reason };
      default:
        return { event: result.event, step_id: result.stepId };
    }
  }

  async endSession({ summary, title = "Hoàn thành" }: { summary: string; title?: string }): Promise<{ ok: true }> {
    const session = this.requireActive();
    this.apply(session.end(title, summary));
    this.waiter?.notify();
    return { ok: true };
  }

  /**
   * Captures the VS Code window (default), the whole primary display or a region, with a grid whose
   * labels are screen coordinates. Works before a lesson starts so the agent can plan.
   */
  async observe({
    region = "ide",
    grid = true,
    maxWidth = 1600,
  }: {
    region?: "ide" | "screen" | Rect;
    grid?: boolean;
    maxWidth?: number;
  }): Promise<{ png: string; meta: ObserveMeta }> {
    const helper = this.requireHelper();
    try {
      const display = (await helper.request<{ bounds: Rect }>("display_info")).bounds;
      let source: ObserveMeta["source"] = "screen";
      let area: Rect = display;
      let windowTitle: string | undefined;
      let note: string | undefined;

      if (typeof region === "object") {
        source = "region";
        area = region;
      } else if (region === "ide") {
        const ide = this.ide ?? (await this.findIde());
        if (!ide) note = "VS Code window not found; showing the whole screen.";
        else {
          try {
            const state = await helper.request<{ bounds: Rect; minimized: boolean }>("window_bounds", { hwnd: ide.hwnd });
            if (state.minimized) note = "VS Code is minimized.";
            else {
              source = "ide";
              area = state.bounds;
              windowTitle = ide.title;
            }
          } catch (error) {
            if (!(error instanceof HelperError && error.code === "WINDOW_NOT_FOUND")) throw error;
            if (this.ide?.hwnd === ide.hwnd) this.ide = null;
            note = "VS Code window was closed; showing the whole screen.";
          }
        }
      }

      const clipped = clipToBounds(area, display);
      if (!clipped) throw new ToolError("BAD_REGION", "The region is outside the screen.");
      const { png, meta } = await this.capture(clipped, source, { grid, maxWidth });
      return { png, meta: { ...meta, ...(windowTitle && { window_title: windowTitle }), ...(note && { note }) } };
    } catch (error) {
      if (!(error instanceof HelperError)) throw error;
      if (error.code === "CAPTURE_FAILED") throw new ToolError("CAPTURE_FAILED", error.message);
      throw new ToolError("HELPER_UNAVAILABLE", "win-helper failed: " + error.message);
    }
  }

  /** Captures a screen area and remembers it, so rects read off the image can be mapped back. */
  private async capture(
    area: Rect,
    source: ObserveMeta["source"],
    options: { grid: boolean; maxWidth: number; boxes?: number[][] },
  ): Promise<{ png: string; meta: ObserveMeta }> {
    const capture = await this.requireHelper().request<CaptureResult>("capture", { ...area, ...options });
    const shot = this.screenshots.add({ origin: capture.origin, scale: capture.scale, width: capture.width, height: capture.height });
    return {
      png: capture.png,
      meta: { screenshot_id: shot.id, source, origin: shot.origin, scale: shot.scale, width: shot.width, height: shot.height },
    };
  }

  /** Resolves once background work (overlay restarts and shutdowns) has settled. */
  async idle() {
    let current;
    do {
      current = this.background;
      await current;
    } while (current !== this.background);
  }

  private requireHelper(): Helper {
    if (!this.deps.helper) throw new ToolError("HELPER_UNAVAILABLE", "win-helper is not configured.");
    return this.deps.helper;
  }

  /** The VS Code window for the workspace, or null when VS Code or the helper is unavailable. */
  private async findIde(workspace?: string): Promise<WindowInfo | null> {
    if (!this.deps.helper) return null;
    try {
      const windows = await this.deps.helper.request<WindowInfo[]>("list_windows", { process: "Code" });
      return chooseIdeWindow(windows, workspace);
    } catch {
      return null;
    }
  }

  private async refreshIde() {
    const ide = await this.findIde(this.workspace);
    if (!ide) return;
    this.ide = { hwnd: ide.hwnd, title: ide.title, path: ide.path || undefined };
    if (this.session?.phase === "active") this.startIdeWatch(ide.minimized ? null : ide.bounds);
  }

  /**
   * Checks the IDE window once: re-locates highlights after it moved, hides the overlay while the
   * user is in another app. Runs on a timer during a lesson; tests call it directly.
   */
  async checkIde(): Promise<void> {
    const helper = this.deps.helper;
    const ide = this.ide;
    const watch = this.ideWatch;
    if (!helper || !ide || !watch || this.session?.phase !== "active" || this.checking) return;
    this.checking = true;
    try {
      let bounds: Rect | null = null;
      let minimized = false;
      try {
        const state = await helper.request<{ bounds: Rect; minimized: boolean }>("window_bounds", { hwnd: ide.hwnd });
        bounds = state.bounds;
        minimized = state.minimized;
      } catch (error) {
        if (!(error instanceof HelperError && error.code === "WINDOW_NOT_FOUND")) return;
      }
      const front = await helper
        .request<{ hwnd: number; process: string } | null>("foreground_window")
        .catch(() => null);
      if (this.ideWatch !== watch) return; // Replaced while we were asking.

      const actions = watch.sample({ bounds, minimized, foregroundHwnd: front?.hwnd ?? null, foregroundProcess: front?.process ?? null });
      for (const action of actions) {
        if (action.type === "moved") this.onWindowMoved(action.from, action.to);
        else if (action.type === "visibility") this.setOverlayVisible(action.visible);
        else {
          // VS Code was closed: forget it; the next step looks for it again.
          this.ide = null;
          this.stopIdeWatch();
        }
      }
    } finally {
      this.checking = false;
    }
  }

  private startIdeWatch(bounds: Rect | null) {
    this.stopIdeWatch();
    if (!this.deps.helper || !this.ide) return;
    this.ideWatch = new IdeWatch(this.ide.hwnd, bounds ?? { x: 0, y: 0, w: 0, h: 0 });
    if (this.overlayHidden) this.setOverlayVisible(true);
    const interval = this.deps.watchIntervalMs ?? 500;
    if (interval > 0) {
      this.watchTimer = setInterval(() => void this.checkIde(), interval);
      this.watchTimer.unref?.();
    }
  }

  private stopIdeWatch() {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
    this.ideWatch = null;
  }

  private setOverlayVisible(visible: boolean) {
    this.overlayHidden = !visible;
    this.overlay?.connection.send({ type: "visibility", visible });
  }

  /**
   * Explicit rects follow the window at once. Described targets are found again: now for the
   * step on screen, when shown again for the others.
   */
  private onWindowMoved(from: Rect, to: Rect) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const onScreen = this.session?.currentRender()?.stepId;
    for (const [stepId, placed] of this.placed) {
      this.placed.set(
        stepId,
        placed.map((p) => (p.target.kind === "rect" && p.rect ? { ...p, rect: { ...p.rect, x: p.rect.x + dx, y: p.rect.y + dy } } : p)),
      );
      const described = placed.some((p) => p.target.kind !== "rect");
      if (stepId === onScreen) this.inBackground(() => this.relocate(stepId));
      else if (described) this.stale.add(stepId);
      else this.showPlaced(stepId);
    }
  }

  /** Finds a step's described targets again where they are now, without reopening files. */
  private async relocate(stepId: string) {
    const placed = this.placed.get(stepId);
    if (!placed || this.session?.phase !== "active") return;
    const described = placed.filter((p) => p.target.kind !== "rect");
    if (described.length) {
      const results = await this.resolveTargets(
        described.map((p) => p.target),
        { reveal: false },
      );
      described.forEach((p, k) => {
        const result = results[k];
        p.rect = result && "rect" in result ? result.rect : null;
      });
    }
    this.showPlaced(stepId);
  }

  private showPlaced(stepId: string) {
    const placed = this.placed.get(stepId);
    const session = this.session;
    if (!placed || !session || session.phase !== "active") return;
    const bounds = this.overlay?.connection.display().boundsPhysical;
    const highlights = placed
      .map((p) => (p.rect && bounds ? clipToBounds(p.rect, bounds) : p.rect))
      .filter((r): r is Rect => r !== null);
    this.apply(session.updateHighlights(stepId, highlights));
  }

  /**
   * A new step is about the IDE: bring it forward if the user is elsewhere (e.g. in the terminal
   * talking to the agent), otherwise the overlay would hide again right away.
   */
  private bringIdeForward() {
    const helper = this.deps.helper;
    const ide = this.ide;
    if (!helper || !ide) return;
    this.inBackground(async () => {
      try {
        const front = await helper.request<{ hwnd: number } | null>("foreground_window");
        if (front?.hwnd !== ide.hwnd) await helper.request("focus_window", { hwnd: ide.hwnd });
      } catch {
        // Best effort.
      }
    });
  }

  /** Chromium builds VS Code's accessibility tree on the first UIA query; do it before the first step. */
  private warmUp(hwnd: number) {
    const helper = this.deps.helper;
    if (!helper) return;
    this.inBackground(async () => {
      try {
        await helper.request("uia_snapshot", { hwnd, minNodes: 30, maxNodes: 50 });
      } catch {
        // Only a head start; locating retries on its own.
      }
    });
  }

  private openInIde(file: string, line: number, column: number): Promise<void> {
    if (!this.deps.openFile) return Promise.reject(new OpenFileError("ide_cli_not_found", "No IDE CLI is configured."));
    return this.deps.openFile(file, line, column, this.ide?.path);
  }

  private fileExists(file: string): boolean {
    return (this.deps.fileExists ?? existsSync)(file);
  }

  private resolvePath(file: string): string | null {
    if (path.isAbsolute(file)) return file;
    return this.workspace ? path.join(this.workspace, file) : null;
  }

  /** After the user typed a question, put keyboard focus back into VS Code. */
  private async focusIde() {
    if (!this.ide || !this.deps.helper) return;
    try {
      await this.deps.helper.request("focus_window", { hwnd: this.ide.hwnd });
    } catch {
      // Best effort: the user can click back into VS Code.
    }
  }

  private requireActive(): Session {
    if (!this.session || this.session.phase !== "active") {
      throw new ToolError("NO_SESSION", "No lesson is running. Call start_session first.");
    }
    return this.session;
  }

  private attach(handle: OverlayHandle) {
    this.overlay = handle;
    handle.connection.onMessage((message) => {
      if (this.overlay !== handle || !this.session) return;
      if (message.type === "focus_released") return this.inBackground(() => this.focusIde());
      if (message.type === "relocate") {
        const stepId = this.session.currentRender()?.stepId;
        if (stepId) this.inBackground(() => this.relocate(stepId));
        return;
      }
      this.apply(this.session.handleOverlay(message));
      this.waiter?.notify();
    });
    handle.onExit(() => this.onOverlayExit(handle));
  }

  private apply(effects: Effects) {
    const link = this.overlay?.connection;
    if (effects.render) link?.send(effects.render);
    if (effects.status !== undefined) link?.send({ type: "status", text: effects.status });
    if (effects.close) this.inBackground(() => this.stopOverlay());
    if (effects.render && this.stale.delete(effects.render.stepId)) {
      const stepId = effects.render.stepId;
      this.inBackground(() => this.relocate(stepId));
    }
    if (this.session?.phase !== "active") this.stopIdeWatch();
    this.syncClickWatch();
  }

  /** Clicks are only watched while a click step with a highlight is on screen. */
  private syncClickWatch() {
    const helper = this.deps.helper;
    if (!helper) return;
    const current = this.session?.phase === "active" ? this.session.currentRender() : undefined;
    const wanted = current?.mode === "click" && current.highlights.length > 0;
    if (wanted === this.watchingClicks) return;
    this.watchingClicks = wanted;
    this.inBackground(async () => {
      try {
        await helper.request("watch_clicks", { enabled: wanted });
      } catch {
        // The user can still press Skip.
      }
    });
  }

  private onScreenClick(x: number, y: number) {
    const session = this.session;
    const current = session?.phase === "active" ? session.currentRender() : undefined;
    if (!session || current?.mode !== "click") return;
    const hit = current.highlights.some((h) => {
      const r = inflate(h, CLICK_TOLERANCE);
      return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    });
    if (!hit) return;
    this.apply(session.handleClick(current.stepId));
    this.waiter?.notify();
  }

  private async stopOverlay() {
    const handle = this.overlay;
    if (!handle) return;
    this.overlay = null;
    this.stoppedByUs.add(handle);
    await handle.stop();
  }

  private onOverlayExit(handle: OverlayHandle) {
    if (this.stoppedByUs.has(handle) || this.overlay !== handle) return;
    this.overlay = null;
    const session = this.session;
    if (!session || session.phase === "ended") return;

    const giveUp = () => {
      session.abort("overlay_crashed");
      this.syncClickWatch();
      this.waiter?.notify();
    };
    if (session.phase !== "active" || this.restarts >= MAX_OVERLAY_RESTARTS) return giveUp();

    this.restarts++;
    this.inBackground(async () => {
      let replacement: OverlayHandle;
      try {
        replacement = await this.deps.launch();
      } catch {
        return giveUp();
      }
      if (this.session !== session || session.phase !== "active") {
        this.stoppedByUs.add(replacement);
        await replacement.stop();
        return;
      }
      this.attach(replacement);
      const current = session.currentRender();
      if (current) replacement.connection.send(current);
    });
  }

  private inBackground(work: () => Promise<void>) {
    this.background = this.background.then(work, work);
  }
}
