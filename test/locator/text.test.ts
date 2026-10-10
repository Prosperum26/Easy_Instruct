import { describe, expect, it } from "vitest";
import { findTextInOcr, findTextInUia, normalizeText, similarText, type OcrLine } from "../../src/locator/text.js";
import { UiaTree } from "../../src/locator/uia.js";
import { explorerAndTerminal } from "../fixtures/uia/vscode-layout.js";

describe("normalizeText", () => {
  it("drops Vietnamese diacritics, case and extra spaces", () => {
    expect(normalizeText("  Tệp  Đã Lưu ")).toBe("tep da luu");
  });
});

describe("similarText", () => {
  it("accepts exact matches after normalising", () => {
    expect(similarText("README.md", "readme.md")).toBe(true);
  });

  it("allows one OCR slip in medium words and two in long ones", () => {
    expect(similarText("install", "instal1")).toBe(true);
    expect(similarText("requirements.txt", "requirernents.txt")).toBe(true);
    expect(similarText("app.py", "apq.py")).toBe(false);
  });
});

describe("findTextInUia", () => {
  const tree = new UiaTree(explorerAndTerminal());

  it("finds a name in reading order, deepest node first", () => {
    expect(findTextInUia(tree, "app.py")).toEqual({ rect: { x: 713, y: 43, w: 120, h: 35 }, method: "uia", confidence: 1 });
    expect(findTextInUia(tree, "app.py", { occurrence: 2 })).toMatchObject({ rect: { x: 61, y: 154, w: 646, h: 22 } });
  });

  it("can be limited to an area", () => {
    const explorer = { x: 55, y: 43, w: 653, h: 942 };
    expect(findTextInUia(tree, "app.py", { within: explorer })).toMatchObject({ rect: { x: 61, y: 154, w: 646, h: 22 } });
  });

  it("ignores the keyboard shortcut VS Code appends to names", () => {
    expect(findTextInUia(tree, "Search")).toEqual({ rect: { x: 9, y: 103, w: 46, h: 46 }, method: "uia", confidence: 0.95 });
  });

  it("returns null when nothing matches", () => {
    expect(findTextInUia(tree, "package.json")).toBeNull();
  });
});

describe("findTextInOcr", () => {
  const w = (text: string, x: number, y = 600) => ({ text, rect: { x, y, w: text.length * 8, h: 14 } });
  const lines: OcrLine[] = [
    { text: "PS C:\\repo> npm install", words: [w("PS", 740), w("C:\\repo>", 764), w("npm", 840), w("instal1", 872)] },
    { text: "added 120 packages", words: [w("added", 740, 624), w("120", 790, 624), w("packages", 820, 624)] },
  ];

  it("finds a phrase across words and returns their union", () => {
    expect(findTextInOcr(lines, "npm install")).toEqual({
      rect: { x: 840, y: 600, w: 88, h: 14 },
      method: "ocr",
      confidence: 0.7,
    });
  });

  it("gives exact OCR matches a higher confidence", () => {
    expect(findTextInOcr(lines, "packages")).toMatchObject({ rect: { x: 820, y: 624 }, confidence: 0.85 });
  });

  it("returns null when the phrase is not there", () => {
    expect(findTextInOcr(lines, "pip install")).toBeNull();
  });
});
