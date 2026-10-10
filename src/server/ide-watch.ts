import type { Rect } from "../shared/geometry.js";

/** One look at the IDE window: window_bounds plus foreground_window. */
export interface IdeSample {
  /** Null when the window no longer exists. */
  bounds: Rect | null;
  minimized: boolean;
  foregroundHwnd: number | null;
  foregroundProcess: string | null;
}

export type WatchAction = { type: "moved"; from: Rect; to: Rect } | { type: "visibility"; visible: boolean } | { type: "gone" };

/** Processes whose windows count as "still in the lesson" when they are in front: the overlay itself. */
const LESSON_PROCESSES = ["electron"];
/** Samples another app must stay in front before the overlay hides (a quick Alt+Tab should not blink it). */
const AWAY_SAMPLES = 2;

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * Decides, sample by sample, when the IDE window has settled in a new place (re-locate the
 * highlights) and when the overlay should hide because the user is in another app.
 */
export class IdeWatch {
  private stable: Rect;
  private pending: Rect | null = null;
  private visible = true;
  private away = 0;
  private gone = false;

  constructor(
    private readonly hwnd: number,
    bounds: Rect,
  ) {
    this.stable = bounds;
  }

  sample(s: IdeSample): WatchAction[] {
    if (s.bounds === null) {
      if (this.gone) return [];
      this.gone = true;
      return [{ type: "gone" }, ...this.setVisible(false)];
    }

    const actions: WatchAction[] = [];
    if (!s.minimized) actions.push(...this.track(s.bounds));

    const inLesson =
      s.foregroundHwnd === null ||
      s.foregroundHwnd === this.hwnd ||
      (s.foregroundProcess !== null && LESSON_PROCESSES.includes(s.foregroundProcess.toLowerCase()));
    this.away = inLesson ? 0 : this.away + 1;
    if (s.minimized) actions.push(...this.setVisible(false));
    else if (inLesson) actions.push(...this.setVisible(true));
    else if (this.away >= AWAY_SAMPLES) actions.push(...this.setVisible(false));
    return actions;
  }

  /** A new position counts once two samples agree, so a drag in progress is not chased. */
  private track(bounds: Rect): WatchAction[] {
    if (sameRect(bounds, this.stable)) {
      this.pending = null;
      return [];
    }
    if (this.pending && sameRect(bounds, this.pending)) {
      const from = this.stable;
      this.stable = bounds;
      this.pending = null;
      return [{ type: "moved", from, to: bounds }];
    }
    this.pending = bounds;
    return [];
  }

  private setVisible(visible: boolean): WatchAction[] {
    if (visible === this.visible) return [];
    this.visible = visible;
    return [{ type: "visibility", visible }];
  }
}
