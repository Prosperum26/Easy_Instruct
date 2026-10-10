import { describe, expect, it } from "vitest";
import { lineSpan, readGutter, type GutterWord } from "../../src/locator/gutter.js";

// Real OCR of VS Code's gutter (125% scaling): sticky scroll shows 114 and 174 on top, line 194 was missed.
const REAL = "114@120 174@143 188@167 189@191 190@215 191@239 192@262 193@286 195@334 196@357 197@381 198@405 199@429 200@452 201@476 202@500 203@524 204@547 205@571 206@595 207@619 208@642 209@666 210@690 211@714 212@737 213@761";
const word = (text: string, top: number, x = 660, h = 12): GutterWord => ({ text, rect: { x, y: top, w: 24, h } });
const parse = (s: string) => s.split(" ").map((p) => p.split("@")).map(([t, y]) => word(t, Number(y)));
// The editor below the sticky widget (644,113 532x49) down to the editor's bottom (113 + 665).
const AREA = { x: 644, y: 162, w: 550, h: 616 };

/** Rows of `pitch` px starting at `top`, one OCR word per entry ("" leaves the row unread). */
const rows = (numbers: string[], top = 200, pitch = 24) =>
  numbers.flatMap((n, i) => (n ? [word(n, top + i * pitch + 6)] : []));
const area = (count: number, top = 200, pitch = 24) => ({ x: 644, y: top, w: 550, h: count * pitch });

describe("readGutter", () => {
  const gutter = readGutter(parse(REAL), AREA);

  it("measures the line height from consecutive numbers", () => {
    if (!gutter.ok) throw new Error(gutter.reason);
    expect(gutter.lineHeight).toBeCloseTo(23.8, 0);
  });

  it("ignores numbers under the sticky scroll widget", () => {
    if (!gutter.ok) throw new Error(gutter.reason);
    expect(gutter.lines.has(114)).toBe(false);
    expect(gutter.lines.has(174)).toBe(false);
    expect(gutter.first).toBe(188);
    expect(gutter.last).toBe(213);
  });

  it("fills in a line OCR missed between two read lines", () => {
    if (!gutter.ok) throw new Error(gutter.reason);
    const missed = gutter.lines.get(194)!;
    expect(missed.interpolated).toBe(true);
    expect(missed.top).toBeCloseTo(gutter.lines.get(193)!.top + gutter.lineHeight, 0);
  });

  it("drops a single misread number that breaks the order", () => {
    const words = parse(REAL).map((w) => (w.text === "200" ? { ...w, text: "280" } : w));
    const result = readGutter(words, AREA);
    if (!result.ok) throw new Error(result.reason);
    expect(result.lines.get(200)?.interpolated).toBe(true);
    expect(result.lines.has(280)).toBe(false);
  });

  it("treats a jump in numbers over one row as folded code", () => {
    const result = readGutter(rows(["10", "11", "12", "20", "21"]), area(5));
    if (!result.ok) throw new Error(result.reason);
    expect(result.lines.has(15)).toBe(false);
    expect(result.folded).toEqual([{ from: 13, to: 19 }]);
  });

  it("gives a wrapped line the height of all its rows", () => {
    const result = readGutter(rows(["10", "", "11", "12"]), area(4));
    if (!result.ok) throw new Error(result.reason);
    expect(result.lines.get(10)!.height).toBeCloseTo(48, 0);
    expect(result.lines.get(11)!.height).toBeCloseTo(24, 0);
  });

  it("recognises relative line numbers", () => {
    expect(readGutter(rows(["3", "2", "1", "57", "1", "2", "3"]), area(7))).toEqual({ ok: false, reason: "relative_line_numbers" });
  });

  it("reports a gutter without numbers", () => {
    expect(readGutter([word("const", 210)], area(3))).toEqual({ ok: false, reason: "line_numbers_hidden" });
    expect(readGutter([], area(3))).toEqual({ ok: false, reason: "line_numbers_hidden" });
  });

  it("estimates the height from the digits when only one line is visible", () => {
    const result = readGutter([word("42", 206)], area(1));
    if (!result.ok) throw new Error(result.reason);
    expect(result.lines.get(42)).toMatchObject({ interpolated: false });
    expect(result.lineHeight).toBeGreaterThan(12);
  });
});

describe("lineSpan", () => {
  const gutter = readGutter(parse(REAL), AREA);
  if (!gutter.ok) throw new Error("fixture must read");

  it("spans from the top of the first line to the bottom of the last", () => {
    const span = lineSpan(gutter, 190, 192, AREA);
    expect(span).toMatchObject({ clipped: false, confidence: 1 });
    if (!("top" in span)) throw new Error();
    expect(span.top).toBeCloseTo(gutter.lines.get(190)!.top, 5);
    expect(span.bottom).toBeCloseTo(gutter.lines.get(192)!.top + gutter.lineHeight, 0);
  });

  it("lowers confidence when an interpolated line is involved", () => {
    const span = lineSpan(gutter, 194, 194, AREA);
    expect(span).toMatchObject({ clipped: false });
    expect("confidence" in span && span.confidence).toBeLessThan(1);
  });

  it("clips a range that runs past the visible lines", () => {
    expect(lineSpan(gutter, 210, 260, AREA)).toMatchObject({ bottom: AREA.y + AREA.h, clipped: true });
    expect(lineSpan(gutter, 150, 189, AREA)).toMatchObject({ top: AREA.y, clipped: true });
  });

  it("reports ranges that are not on screen", () => {
    expect(lineSpan(gutter, 300, 310, AREA)).toEqual({ reason: "line_not_visible" });
    expect(lineSpan(gutter, 10, 20, AREA)).toEqual({ reason: "line_not_visible" });
  });

  it("reports lines hidden inside folded code", () => {
    const folded = readGutter(rows(["10", "11", "12", "20", "21"]), area(5));
    if (!folded.ok) throw new Error();
    expect(lineSpan(folded, 15, 16, area(5))).toEqual({ reason: "line_folded" });
  });
});
