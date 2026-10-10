import { randomUUID } from "node:crypto";
import { clipToBounds, type Rect } from "../shared/geometry.js";
import type { ButtonId, DisplayInfo, OverlayToServer, ServerToOverlay, StepMode } from "../shared/protocol.js";
import { Session, type Effects, type StepInput } from "../session/session.js";
import { EventWaiter, WaitInProgressError } from "../session/waiter.js";

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

export type ToolErrorCode = "NO_SESSION" | "SESSION_ACTIVE" | "LAUNCH_FAILED" | "WAIT_IN_PROGRESS";

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Target = { kind: "rect"; x: number; y: number; w: number; h: number } | { kind: "none" };

export interface ResolvedTarget {
  rect: Rect;
  method: "explicit";
  confidence: number;
}

export interface UnresolvedTarget {
  target: Target;
  reason: "off_screen";
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

  constructor(private readonly deps: { launch: () => Promise<OverlayHandle> }) {}

  async startSession({ title, intro }: { title: string; intro: string }): Promise<{ sessionId: string }> {
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

      const session = new Session();
      this.session = session;
      this.waiter = new EventWaiter(() => session.takeEvent());
      this.restarts = 0;
      this.attach(handle);
      this.apply(
        session.showStep({ kind: "card", title, bodyMd: intro, mode: "read", highlights: [], actionButtons: ["exit", "start"] }),
      );
      return { sessionId: randomUUID() };
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
  }): Promise<{ stepId: string; resolved: ResolvedTarget[]; unresolved: UnresolvedTarget[] }> {
    const session = this.requireActive();
    const bounds = this.overlay?.connection.display().boundsPhysical;
    const resolved: ResolvedTarget[] = [];
    const unresolved: UnresolvedTarget[] = [];

    for (const target of input.targets) {
      if (target.kind === "none") continue;
      const clipped = bounds ? clipToBounds(target, bounds) : { x: target.x, y: target.y, w: target.w, h: target.h };
      if (clipped) resolved.push({ rect: clipped, method: "explicit", confidence: 1 });
      else unresolved.push({ target, reason: "off_screen" });
    }

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
    this.apply(effects);
    return { stepId: effects.render.stepId, resolved, unresolved };
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

  /** Resolves once background work (overlay restarts and shutdowns) has settled. */
  async idle() {
    let current;
    do {
      current = this.background;
      await current;
    } while (current !== this.background);
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
