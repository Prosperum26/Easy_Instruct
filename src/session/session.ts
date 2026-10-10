import type { Rect } from "../shared/geometry.js";
import type { ButtonId, OverlayToServer, RenderMessage, StepMode } from "../shared/protocol.js";

export const WAITING_STATUS = "Đang chờ AI…";

/** A step as the agent describes it; the session adds the id and the back button. */
export interface StepInput {
  kind: "bubble" | "card";
  title: string;
  bodyMd: string;
  label?: string;
  mode: StepMode;
  /** Physical screen pixels, already clipped to the display. */
  highlights: Rect[];
  /** Buttons other than back, e.g. ["ask", "next"]. */
  actionButtons: ButtonId[];
}

export type ExitReason = "user" | "overlay_crashed";

/** What `wait_for_user` hands back to the agent. */
export type UserEvent =
  | { event: "next" | "done" | "skip" | "clicked"; stepId: string }
  | { event: "ask"; stepId: string; question: string }
  | { event: "exit"; stepId: string | null; reason: ExitReason };

/** What the caller must do after a session change. */
export interface Effects {
  render?: RenderMessage;
  /** A status pill text, or null to hide it. Absent means unchanged. */
  status?: string | null;
  /** The overlay should close. */
  close?: boolean;
}

export type Phase = "active" | "ending" | "ended";

interface StepRecord {
  input: StepInput;
  stepId: string;
  allowBack: boolean;
}

const ADVANCE_EVENTS: Partial<Record<ButtonId, "next" | "done" | "skip">> = {
  next: "next",
  start: "next",
  done: "done",
  skip: "skip",
};

/**
 * One lesson: the steps shown so far, which one is on screen, and the queue of user
 * events waiting for the agent. Pure state, no I/O: callers apply the returned Effects.
 *
 * Back/forward through steps already seen is handled here without waking the agent;
 * only finishing the newest step, asking or exiting produces an event.
 */
export class Session {
  phase: Phase = "active";
  private steps: StepRecord[] = [];
  private cursor = -1;
  private awaitingAgent = false;
  private queue: UserEvent[] = [];

  showStep(input: StepInput): Effects & { render: RenderMessage } {
    this.steps.push({ input, stepId: `s${this.steps.length + 1}`, allowBack: this.steps.length > 0 });
    this.cursor = this.steps.length - 1;
    this.awaitingAgent = false;
    // An advance from an older step is stale once the agent has moved on.
    this.queue = this.queue.filter((e) => e.event === "ask" || e.event === "exit");
    return { render: this.renderAt(this.cursor), status: null };
  }

  /** Shows the summary card; closing it ends the session without another event. */
  end(title: string, bodyMd: string): Effects & { render: RenderMessage } {
    const shown = this.showStep({ kind: "card", title, bodyMd, mode: "read", highlights: [], actionButtons: ["close"] });
    this.steps[this.cursor].allowBack = false;
    this.phase = "ending";
    return { ...shown, render: this.renderAt(this.cursor) };
  }

  /** Ends the session because the overlay is gone. */
  abort(reason: ExitReason) {
    if (this.phase === "active") this.queue.push({ event: "exit", stepId: this.current?.stepId ?? null, reason });
    this.phase = "ended";
  }

  handleOverlay(message: OverlayToServer): Effects {
    if (this.phase === "ended") return {};
    if (message.type !== "button" && message.type !== "ask") return {};
    const current = this.current;
    if (!current || message.stepId !== current.stepId) return {};

    if (this.phase === "ending") {
      if (message.type === "button" && (message.button === "close" || message.button === "exit")) {
        this.phase = "ended";
        return { close: true };
      }
      return {};
    }

    if (message.type === "ask") {
      const question = message.question.trim();
      if (question) this.queue.push({ event: "ask", stepId: current.stepId, question });
      return {};
    }

    const { button } = message;
    if (button === "exit" || button === "close") {
      this.queue.push({ event: "exit", stepId: current.stepId, reason: "user" });
      this.phase = "ended";
      return { close: true };
    }

    if (button === "back") {
      if (this.cursor === 0) return {};
      this.cursor--;
      return { render: this.renderAt(this.cursor) };
    }

    const advance = ADVANCE_EVENTS[button];
    if (!advance) return {};
    if (this.cursor < this.steps.length - 1) {
      this.cursor++;
      return { render: this.renderAt(this.cursor) };
    }
    if (this.awaitingAgent) return {};
    this.awaitingAgent = true;
    this.queue.push({ event: advance, stepId: current.stepId });
    return { status: WAITING_STATUS };
  }

  /** A click inside the highlight of a click step: like Next, but only for click steps. */
  handleClick(stepId: string): Effects {
    const current = this.current;
    if (this.phase !== "active" || !current || current.stepId !== stepId || current.input.mode !== "click") return {};
    if (this.cursor < this.steps.length - 1) {
      this.cursor++;
      return { render: this.renderAt(this.cursor) };
    }
    if (this.awaitingAgent) return {};
    this.awaitingAgent = true;
    this.queue.push({ event: "clicked", stepId });
    return { status: WAITING_STATUS };
  }

  /** New highlights for a step (after re-locating its targets); redraws it if it is on screen. */
  updateHighlights(stepId: string, highlights: Rect[]): Effects {
    const index = this.steps.findIndex((step) => step.stepId === stepId);
    if (index < 0) return {};
    const record = this.steps[index];
    record.input = { ...record.input, highlights, kind: highlights.length ? "bubble" : "card" };
    return index === this.cursor ? { render: this.renderAt(index) } : {};
  }

  takeEvent(): UserEvent | undefined {
    return this.queue.shift();
  }

  hasEvents(): boolean {
    return this.queue.length > 0;
  }

  /** The step on screen, e.g. to redraw it after the overlay restarts. */
  currentRender(): RenderMessage | undefined {
    return this.cursor >= 0 ? this.renderAt(this.cursor) : undefined;
  }

  private get current(): StepRecord | undefined {
    return this.steps[this.cursor];
  }

  private renderAt(index: number): RenderMessage {
    const { input, stepId, allowBack } = this.steps[index];
    const showBack = allowBack && index > 0;
    return {
      type: "render",
      stepId,
      kind: input.kind,
      title: input.title,
      bodyMd: input.bodyMd,
      label: input.label,
      mode: input.mode,
      highlights: input.highlights,
      buttons: showBack ? ["back", ...input.actionButtons] : input.actionButtons,
    };
  }
}
