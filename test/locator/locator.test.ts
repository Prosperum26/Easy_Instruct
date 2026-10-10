import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Locator, OpenFileError } from "../../src/locator/locator.js";
import type { OcrLine } from "../../src/locator/text.js";
import type { Rect } from "../../src/shared/geometry.js";
import { explorerAndTerminal, searchOpenPanelClosed } from "../fixtures/uia/vscode-layout.js";
import { FakeHelper } from "../helpers/fake-helper.js";

const ide = { hwnd: 42, workspace: "C:\\repos\\demo" };
const APP = "C:\\repos\\demo\\app.py";

/** The fixture's editor: monaco 713,113 1202x384, sticky widget 24px high, code starts at x=790. */
const EDITOR = { x: 713, y: 113, w: 1202, h: 384 };
const TEXT_TOP = 137;
const PITCH = 24;

/** Gutter OCR: line 12 in the sticky widget, then lines from `first` on, one per row. */
function gutterOcr(first: number, count = 15): OcrLine[] {
  const word = (text: string, cy: number) => ({ text, rect: { x: 740, y: cy - 6, w: 20, h: 12 } });
  const lines = [{ text: "12", words: [word("12", 125)] }];
  for (let i = 0; i < count; i++) {
    const n = String(first + i);
    lines.push({ text: n, words: [word(n, TEXT_TOP + PITCH / 2 + i * PITCH)] });
  }
  return lines;
}

/** The fixture with another file as the active tab. */
function otherFileActive() {
  const snapshot = explorerAndTerminal();
  snapshot.nodes = snapshot.nodes.map((n, i) =>
    i === 18 ? { ...n, c: "tab tab-actions-right" } : i === 19 ? { ...n, c: "tab tab-actions-right active selected" } : n,
  );
  return snapshot;
}

describe("Locator", () => {
  let helper: FakeHelper;
  let opened: Array<{ file: string; line: number }>;
  let files: Set<string>;
  let locator: Locator;
  let openFile: (file: string, line: number) => Promise<void>;

  beforeEach(() => {
    helper = new FakeHelper();
    helper.snapshot = explorerAndTerminal();
    opened = [];
    files = new Set([APP]);
    openFile = async (file, line) => {
      opened.push({ file, line });
    };
    locator = new Locator({
      helper,
      openFile: (file, line) => openFile(file, line),
      fileExists: (p) => files.has(p),
      sleep: async () => {},
    });
  });

  describe("ui targets", () => {
    it("locates VS Code parts", async () => {
      const [result] = await locator.locate([{ kind: "ui", element: "explorer" }], ide);
      expect(result).toEqual({ rect: { x: 55, y: 43, w: 653, h: 942 }, method: "uia", confidence: 1, detail: "view" });
    });

    it("asks for warm UIA trees and shares one snapshot between targets", async () => {
      await locator.locate(
        [
          { kind: "ui", element: "terminal" },
          { kind: "ui", element: "search" },
          { kind: "text", text: "README.md" },
        ],
        ide,
      );
      expect(helper.callsTo("uia_snapshot")).toHaveLength(1);
      expect(helper.callsTo("uia_snapshot")[0].args).toMatchObject({ hwnd: 42, minNodes: 30 });
    });

    it("explains parts that are not on screen", async () => {
      helper.snapshot = searchOpenPanelClosed();
      expect(await locator.locate([{ kind: "ui", element: "terminal" }], ide)).toEqual([{ reason: "not_visible" }]);
    });
  });

  describe("text targets", () => {
    it("prefers accessible names", async () => {
      const [result] = await locator.locate([{ kind: "text", text: "README.md" }], ide);
      expect(result).toEqual({ rect: { x: 833, y: 43, w: 130, h: 35 }, method: "uia", confidence: 1 });
      expect(helper.callsTo("ocr")).toHaveLength(0);
    });

    it("falls back to OCR inside the given part", async () => {
      helper.ocr = (region: Rect) =>
        region.x === 714
          ? [{ text: "> npm install", words: [{ text: ">", rect: { x: 740, y: 560, w: 8, h: 14 } }, { text: "npm", rect: { x: 752, y: 560, w: 24, h: 14 } }, { text: "install", rect: { x: 780, y: 560, w: 50, h: 14 } }] }]
          : [];
      const [result] = await locator.locate([{ kind: "text", text: "npm install", within: "terminal" }], ide);
      expect(helper.callsTo("ocr")[0].args).toMatchObject({ x: 714, y: 542, w: 1200, h: 417 });
      expect(result).toEqual({ rect: { x: 752, y: 560, w: 78, h: 14 }, method: "ocr", confidence: 0.85 });
    });

    it("reads the whole window when no part is given", async () => {
      await locator.locate([{ kind: "text", text: "nothing like this" }], ide);
      expect(helper.callsTo("ocr")[0].args).toMatchObject({ x: 0, y: 0, w: 1920, h: 1020 });
    });

    it("reports text that is nowhere", async () => {
      expect(await locator.locate([{ kind: "text", text: "nothing like this" }], ide)).toEqual([{ reason: "text_not_found" }]);
    });

    it("says the view is closed instead of searching its activity bar icon", async () => {
      helper.snapshot = searchOpenPanelClosed();
      expect(await locator.locate([{ kind: "text", text: "app.py", within: "explorer" }], ide)).toEqual([{ reason: "not_visible" }]);
      expect(helper.callsTo("ocr")).toHaveLength(0);
    });

    it("reports a part to search in that is not on screen", async () => {
      helper.snapshot = searchOpenPanelClosed();
      expect(await locator.locate([{ kind: "text", text: "npm", within: "terminal" }], ide)).toEqual([{ reason: "not_visible" }]);
    });
  });

  describe("lines targets", () => {
    beforeEach(() => {
      helper.ocr = (region) => (region.x === EDITOR.x && region.y === EDITOR.y ? gutterOcr(40) : []);
    });

    it("opens the file at the first line and highlights the lines across the editor", async () => {
      const [result] = await locator.locate([{ kind: "lines", file: APP, start: 42, end: 44 }], ide);
      expect(opened).toEqual([{ file: APP, line: 42 }]);
      expect(helper.callsTo("ocr")[0].args).toMatchObject({ x: 713, y: 113, w: 77, h: 384, scale: 2 });
      expect(result).toEqual({
        rect: { x: 713, y: TEXT_TOP + 2 * PITCH, w: 1202, h: 3 * PITCH },
        method: "ocr_gutter",
        confidence: 1,
        clipped: false,
      });
    });

    it("resolves paths relative to the workspace", async () => {
      await locator.locate([{ kind: "lines", file: "app.py", start: 42 }], ide);
      expect(opened[0].file).toBe(path.join("C:\\repos\\demo", "app.py"));
    });

    it("waits until VS Code shows the file", async () => {
      helper.snapshot = (count) => (count === 0 ? otherFileActive() : explorerAndTerminal());
      const [result] = await locator.locate([{ kind: "lines", file: APP, start: 42 }], ide);
      expect(result).toMatchObject({ method: "ocr_gutter" });
      expect(helper.callsTo("uia_snapshot").length).toBeGreaterThanOrEqual(2);
    });

    it("gives up when VS Code never shows the file", async () => {
      helper.snapshot = otherFileActive();
      expect(await locator.locate([{ kind: "lines", file: APP, start: 42 }], ide)).toEqual([{ reason: "editor_not_found" }]);
    });

    it("reports missing files without opening anything", async () => {
      expect(await locator.locate([{ kind: "lines", file: "C:\\repos\\demo\\gone.py", start: 1 }], ide)).toEqual([
        { reason: "file_not_found" },
      ]);
      expect(opened).toEqual([]);
    });

    it("passes on what the gutter says", async () => {
      helper.ocr = () => [];
      expect(await locator.locate([{ kind: "lines", file: APP, start: 42 }], ide)).toEqual([{ reason: "line_numbers_hidden" }]);
    });

    it("reports lines that stay off screen after revealing them", async () => {
      expect(await locator.locate([{ kind: "lines", file: APP, start: 400 }], ide)).toEqual([{ reason: "line_not_visible" }]);
    });

    it("can find lines where they are without opening the file again", async () => {
      const [result] = await locator.locate([{ kind: "lines", file: APP, start: 42, end: 44 }], ide, { reveal: false });
      expect(opened).toEqual([]);
      expect(result).toMatchObject({ rect: { y: TEXT_TOP + 2 * PITCH, h: 3 * PITCH }, method: "ocr_gutter" });
    });

    it("does not wait for a file that is not shown when not revealing", async () => {
      helper.snapshot = otherFileActive();
      expect(await locator.locate([{ kind: "lines", file: APP, start: 42 }], ide, { reveal: false })).toEqual([
        { reason: "editor_not_found" },
      ]);
      expect(helper.callsTo("uia_snapshot")).toHaveLength(1);
    });

    it("reports when the IDE's CLI cannot be found", async () => {
      openFile = async () => {
        throw new OpenFileError("ide_cli_not_found", "no CLI");
      };
      expect(await locator.locate([{ kind: "lines", file: APP, start: 42 }], ide)).toEqual([{ reason: "ide_cli_not_found" }]);
    });
  });

  it("reports every target when there is no IDE window", async () => {
    expect(await locator.locate([{ kind: "ui", element: "editor" }, { kind: "text", text: "x" }], null)).toEqual([
      { reason: "window_not_found" },
      { reason: "window_not_found" },
    ]);
  });

  it("reports every target when the helper is down", async () => {
    helper.unavailable = true;
    expect(await locator.locate([{ kind: "ui", element: "editor" }], ide)).toEqual([{ reason: "helper_unavailable" }]);
  });
});
