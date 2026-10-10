import type { Rect } from "./geometry.js";

export type StepMode = "read" | "click" | "do";

export type ButtonId = "back" | "ask" | "next" | "done" | "skip" | "start" | "exit" | "close";

/** Messages the server sends to the overlay. All rects are physical screen pixels. */
export type ServerToOverlay =
  | {
      type: "render";
      stepId: string;
      kind: "bubble" | "card";
      title: string;
      bodyMd: string;
      label?: string;
      mode: StepMode;
      highlights: Rect[];
      buttons: ButtonId[];
    }
  | { type: "status"; text: string | null }
  | { type: "visibility"; visible: boolean }
  | { type: "close" };

export type RenderMessage = Extract<ServerToOverlay, { type: "render" }>;

/** Where the overlay window sits, so physical pixels can be mapped to CSS pixels and clipped. */
export interface DisplayInfo {
  scaleFactor: number;
  /** The display in physical screen pixels. */
  boundsPhysical: Rect;
}

/** Messages the overlay sends back to the server. */
export type OverlayToServer =
  | { type: "hello"; token: string; display: DisplayInfo }
  | { type: "display"; display: DisplayInfo }
  | { type: "button"; stepId: string; button: ButtonId }
  | { type: "ask"; stepId: string; question: string }
  /** The ask form closed; keyboard focus should go back to the app the user was in. */
  | { type: "focus_released" }
  /** Ctrl+Alt+R: find the step's targets again, e.g. after the user scrolled. */
  | { type: "relocate" };
