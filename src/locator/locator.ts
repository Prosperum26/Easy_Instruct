import path from "node:path";
import type { Helper } from "../helper-client/helper.js";
import type { Rect } from "../shared/geometry.js";
import { lineSpan, readGutter } from "./gutter.js";
import { findTextInOcr, findTextInUia, type OcrLine } from "./text.js";
import { toRect, UiaTree, type TreeNode, type UiaSnapshot } from "./uia.js";
import { locateUi, type UiElement } from "./vscode-layout.js";

export type SmartTarget =
  | { kind: "ui"; element: UiElement }
  | { kind: "text"; text: string; within?: UiElement; occurrence?: number }
  | { kind: "lines"; file: string; start: number; end?: number };

export type LocateFailure =
  | "window_not_found"
  | "helper_unavailable"
  | "element_not_found"
  | "not_visible"
  | "text_not_found"
  | "file_not_found"
  | "ide_cli_not_found"
  | "ide_cli_failed"
  | "editor_not_found"
  | "line_numbers_hidden"
  | "relative_line_numbers"
  | "line_not_visible"
  | "line_folded"
  | "ocr_failed";

export type Located =
  | {
      rect: Rect;
      method: "uia" | "ocr" | "ocr_gutter";
      confidence: number;
      /** ui targets: the part itself ("view") or the icon that opens it ("icon"). */
      detail?: "view" | "icon";
      /** lines targets: part of the range is outside the editor. */
      clipped?: boolean;
    }
  | { reason: LocateFailure };

export class OpenFileError extends Error {
  constructor(
    readonly reason: "ide_cli_not_found" | "ide_cli_failed",
    message: string,
  ) {
    super(message);
  }
}

export interface LocatorDeps {
  helper: Helper;
  /** Opens a file at a line in the IDE (VS Code CLI); throws OpenFileError. */
  openFile(file: string, line: number): Promise<void>;
  fileExists(file: string): boolean;
  sleep(ms: number): Promise<void>;
}

/** Chromium builds its accessibility tree lazily; until then a snapshot is just the frame. */
const WARM_TREE_NODES = 30;
const SHOW_FILE_ATTEMPTS = 6;
const SHOW_FILE_DELAY_MS = 300;
/** Gutter width when sticky scroll does not tell us where the code starts. */
const DEFAULT_GUTTER_WIDTH = 80;
const MAX_OCR_SIDE = 4096;

class Failure extends Error {
  constructor(readonly reason: LocateFailure) {
    super(reason);
  }
}

/**
 * Turns smart targets into screen rects: VS Code parts from UI Automation, text from accessible
 * names or OCR, and code lines by revealing them with the CLI and reading the line-number gutter.
 */
export class Locator {
  constructor(private readonly deps: LocatorDeps) {}

  /**
   * reveal (default true) opens files of lines targets at their line first; false finds lines where
   * they already are, e.g. when re-locating after the window moved, so the user's scrolling is kept.
   */
  async locate(
    targets: SmartTarget[],
    ide: { hwnd: number; workspace?: string } | null,
    options: { reveal?: boolean } = {},
  ): Promise<Located[]> {
    if (!ide) return targets.map(() => ({ reason: "window_not_found" }));
    const run = new Run(this.deps, ide, options.reveal ?? true);
    const results: Located[] = [];
    for (const target of targets) {
      try {
        results.push(await run.locate(target));
      } catch (error) {
        if (error instanceof Failure) results.push({ reason: error.reason });
        else if (error instanceof OpenFileError) results.push({ reason: error.reason });
        else if (isHelperError(error)) results.push({ reason: (error as { code: string }).code === "OCR_UNAVAILABLE" ? "ocr_failed" : "helper_unavailable" });
        else throw error;
      }
    }
    return results;
  }
}

const isHelperError = (error: unknown) => error instanceof Error && typeof (error as { code?: unknown }).code === "string";

/** One show_step's worth of locating: shares a UIA snapshot until the IDE is changed. */
class Run {
  private tree: UiaTree | null = null;

  constructor(
    private readonly deps: LocatorDeps,
    private readonly ide: { hwnd: number; workspace?: string },
    private readonly reveal: boolean,
  ) {}

  async locate(target: SmartTarget): Promise<Located> {
    switch (target.kind) {
      case "ui":
        return this.ui(target.element);
      case "text":
        return this.text(target.text, target.within, target.occurrence);
      case "lines":
        return this.lines(target.file, target.start, target.end ?? target.start);
    }
  }

  private async snapshot(fresh = false): Promise<UiaTree> {
    if (!this.tree || fresh) {
      const snapshot = await this.deps.helper.request<UiaSnapshot>("uia_snapshot", { hwnd: this.ide.hwnd, minNodes: WARM_TREE_NODES });
      this.tree = new UiaTree(snapshot);
    }
    return this.tree;
  }

  private async ui(element: UiElement): Promise<Located> {
    const found = locateUi(await this.snapshot(), element);
    if ("reason" in found) return found;
    return { rect: found.rect, method: "uia", confidence: 1, detail: found.detail };
  }

  private async text(text: string, within: UiElement | undefined, occurrence?: number): Promise<Located> {
    const tree = await this.snapshot();
    let area: Rect = tree.window;
    if (within) {
      const part = locateUi(tree, within);
      if ("reason" in part) return part;
      area = part.rect;
    }
    const byName = findTextInUia(tree, text, { within: area, occurrence });
    if (byName) return byName;
    const byOcr = findTextInOcr(await this.ocr(area), text, { occurrence });
    return byOcr ?? { reason: "text_not_found" };
  }

  private async lines(file: string, start: number, end: number): Promise<Located> {
    const absolute = path.isAbsolute(file) ? file : path.join(this.ide.workspace ?? "", file);
    if (!this.deps.fileExists(absolute)) return { reason: "file_not_found" };

    if (this.reveal) {
      await this.deps.openFile(absolute, start);
      this.tree = null;
    }

    let lastReason: LocateFailure = "editor_not_found";
    const attempts = this.reveal ? SHOW_FILE_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await this.deps.sleep(SHOW_FILE_DELAY_MS);
      const tree = await this.snapshot(this.reveal);
      const editor = this.editorShowing(tree, path.basename(absolute));
      if (!editor) continue;

      const located = await this.readLines(tree, editor, start, end);
      if (!("reason" in located)) return located;
      lastReason = located.reason;
      // Revealing can still be scrolling; anything else will not change by waiting.
      if (located.reason !== "line_not_visible") return located;
    }
    return { reason: lastReason };
  }

  /** The editor that shows `fileName`: the active tab must be that file. */
  private editorShowing(tree: UiaTree, fileName: string): TreeNode | null {
    const tab = tree.find((n) => n.t === "TabItem" && tree.hasClasses(n, ["tab", "active"]), { visible: true });
    const name = tab?.n ?? "";
    if (!(name === fileName || name.startsWith(`${fileName},`) || name.startsWith(`${fileName} `))) return null;

    const editors = tree.findAll(
      (n) => tree.hasClasses(n, ["monaco-editor"]) && !tree.hasClasses(n, ["original-in-monaco-diff-editor"]),
      { visible: true },
    );
    const area = (n: TreeNode) => tree.visibleRect(n)!.w * tree.visibleRect(n)!.h;
    return editors.find((n) => tree.hasClasses(n, ["focused"])) ?? editors.sort((a, b) => area(b) - area(a))[0] ?? null;
  }

  private async readLines(tree: UiaTree, editor: TreeNode, start: number, end: number): Promise<Located> {
    const box = tree.visibleRect(editor)!;
    const inEditor = (n: TreeNode) => tree.isDescendant(n, editor);
    const sticky = tree.find((n) => inEditor(n) && tree.classes(n)[0] === "sticky-widget", { visible: true });
    const stickyLine = tree.find((n) => inEditor(n) && tree.hasClasses(n, ["sticky-line-content"]), { visible: true });

    // Sticky scroll lines repeat outer scopes over the first rows; the code starts below them.
    const textTop = sticky ? toRect(sticky.r!).y + toRect(sticky.r!).h : box.y;
    const gutterWidth = stickyLine ? Math.max(1, toRect(stickyLine.r!).x - box.x) : Math.min(DEFAULT_GUTTER_WIDTH, box.w);
    const area = { x: box.x, y: textTop, w: box.w, h: box.y + box.h - textTop };

    const lines = await this.ocr({ x: box.x, y: box.y, w: gutterWidth, h: box.h });
    const gutter = readGutter(lines.flatMap((l) => l.words), area);
    if (!gutter.ok) return { reason: gutter.reason };
    const span = lineSpan(gutter, start, end, area);
    if ("reason" in span) return span;
    return {
      rect: { x: box.x, y: Math.round(span.top), w: box.w, h: Math.round(span.bottom - span.top) },
      method: "ocr_gutter",
      confidence: span.confidence,
      clipped: span.clipped,
    };
  }

  private async ocr(region: Rect): Promise<OcrLine[]> {
    const scale = region.w * 2 <= MAX_OCR_SIDE && region.h * 2 <= MAX_OCR_SIDE ? 2 : 1;
    const result = await this.deps.helper.request<{ lines: OcrLine[] }>("ocr", {
      ...region,
      scale,
    });
    return result.lines.map((line) => ({ text: line.text, words: line.words.map((w) => ({ text: w.text, rect: asRect(w.rect) })) }));
  }
}

/** OCR rects come back from the helper as [x, y, w, h]; fakes may already use objects. */
function asRect(rect: Rect | number[]): Rect {
  return Array.isArray(rect) ? toRect(rect) : rect;
}
