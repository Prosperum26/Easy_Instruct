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

/** Messages the overlay sends back to the server. */
export type OverlayToServer =
  | { type: "button"; stepId: string; button: ButtonId }
  | { type: "ask"; stepId: string; question: string };

/** Where the overlay window sits, so the renderer can map physical pixels to CSS pixels. */
export interface DisplayInfo {
  scaleFactor: number;
  /** Top-left of the display in physical screen pixels. */
  originPhysical: { x: number; y: number };
}
