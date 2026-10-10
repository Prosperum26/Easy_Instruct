import type { Rect } from "../shared/geometry.js";

/** An OCR word from the line-number gutter, in physical screen pixels. */
export interface GutterWord {
  text: string;
  rect: Rect;
}

export interface GutterLine {
  /** Top of the line's first row. */
  top: number;
  /** All rows of the line (more than one when it wraps). */
  height: number;
  /** Not read by OCR but placed between two lines that were. */
  interpolated: boolean;
}

export type Gutter =
  | {
      ok: true;
      lines: Map<number, GutterLine>;
      lineHeight: number;
      first: number;
      last: number;
      /** Line ranges hidden inside folded code. */
      folded: Array<{ from: number; to: number }>;
    }
  | { ok: false; reason: "line_numbers_hidden" | "relative_line_numbers" };

export type ReadGutter = Extract<Gutter, { ok: true }>;

export type LineSpan =
  | { top: number; bottom: number; clipped: boolean; confidence: number }
  | { reason: "line_not_visible" | "line_folded" };

interface Number_ {
  n: number;
  cy: number;
  h: number;
}

/**
 * Turns OCR'd line numbers into the screen position of each visible line. `area` is the editor's
 * text area; words outside it (e.g. under the sticky scroll widget) are ignored.
 */
export function readGutter(words: GutterWord[], area: Rect): Gutter {
  const numbers: Number_[] = words
    .filter((w) => /^\d+$/.test(w.text))
    .map((w) => ({ n: Number(w.text), cy: w.rect.y + w.rect.h / 2, h: w.rect.h }))
    .filter((w) => w.cy >= area.y && w.cy < area.y + area.h)
    .sort((a, b) => a.cy - b.cy);
  if (numbers.length === 0) return { ok: false, reason: "line_numbers_hidden" };

  // Relative line numbers count away from the cursor, so they go down then up again.
  const descending = numbers.slice(1).filter((w, i) => w.n < numbers[i].n).length;
  if (descending >= 2 && descending >= (numbers.length - 1) / 4) return { ok: false, reason: "relative_line_numbers" };

  // Isolated misreads break the order; keep the longest increasing run.
  const kept = longestIncreasing(numbers);
  const lineHeight = measureLineHeight(kept);

  const lines = new Map<number, GutterLine>();
  const folded: Array<{ from: number; to: number }> = [];
  kept.forEach((current, i) => {
    const top = current.cy - lineHeight / 2;
    const next = kept[i + 1];
    if (!next) {
      lines.set(current.n, { top, height: lineHeight, interpolated: false });
      return;
    }
    const lineGap = next.n - current.n;
    const rowGap = Math.max(1, Math.round((next.cy - current.cy) / lineHeight));
    if (rowGap > lineGap) {
      // The current line wraps over the extra rows.
      const height = next.cy - current.cy - (lineGap - 1) * lineHeight;
      lines.set(current.n, { top, height, interpolated: false });
      for (let k = 1; k < lineGap; k++) lines.set(current.n + k, { top: top + height + (k - 1) * lineHeight, height: lineHeight, interpolated: true });
      return;
    }
    lines.set(current.n, { top, height: lineHeight, interpolated: false });
    // Rows between are lines OCR missed; any further numbers are folded away.
    for (let k = 1; k < rowGap; k++) lines.set(current.n + k, { top: top + k * lineHeight, height: lineHeight, interpolated: true });
    if (rowGap < lineGap) folded.push({ from: current.n + rowGap, to: next.n - 1 });
  });

  const keys = [...lines.keys()];
  return { ok: true, lines, lineHeight, first: Math.min(...keys), last: Math.max(...keys), folded };
}

/** Where lines start..end are on screen, clipped to `area` when they run past the visible lines. */
export function lineSpan(gutter: ReadGutter, start: number, end: number, area: Rect): LineSpan {
  if (end < gutter.first || start > gutter.last) return { reason: "line_not_visible" };
  const isFolded = (n: number) => gutter.folded.some((f) => n >= f.from && n <= f.to);
  let allFolded = true;
  for (let n = Math.max(start, gutter.first); n <= Math.min(end, gutter.last); n++) {
    if (!isFolded(n)) {
      allFolded = false;
      break;
    }
  }
  if (allFolded) return { reason: "line_folded" };

  let confidence = 1;
  let clipped = false;
  // A line inside a fold is shown by the fold's header line.
  const lineAt = (n: number) => {
    const fold = gutter.folded.find((f) => n >= f.from && n <= f.to);
    if (fold) confidence = Math.min(confidence, 0.6);
    const line = gutter.lines.get(fold ? fold.from - 1 : n)!;
    if (line.interpolated) confidence = Math.min(confidence, 0.8);
    return line;
  };

  let top: number;
  if (start < gutter.first) {
    top = area.y;
    clipped = true;
  } else {
    top = lineAt(start).top;
  }
  let bottom: number;
  if (end > gutter.last) {
    bottom = area.y + area.h;
    clipped = true;
  } else {
    const line = lineAt(end);
    bottom = line.top + line.height;
  }
  if (clipped) confidence = Math.min(confidence, 0.7);
  return {
    top: Math.max(area.y, top),
    bottom: Math.min(area.y + area.h, bottom),
    clipped,
    confidence,
  };
}

function measureLineHeight(numbers: Number_[]): number {
  const pitches = numbers
    .slice(1)
    .map((w, i) => ({ dn: w.n - numbers[i].n, dy: w.cy - numbers[i].cy }))
    .filter((p) => p.dn === 1)
    .map((p) => p.dy);
  if (pitches.length > 0) {
    // Wrapped lines make some pitches a multiple of the line height: use the smallest pitch,
    // averaged with those close to it.
    const smallest = Math.min(...pitches);
    const single = pitches.filter((p) => p <= smallest * 1.15);
    return single.reduce((sum, p) => sum + p, 0) / single.length;
  }
  // One visible line (or none adjacent): line height is roughly twice the digit height.
  return median(numbers.map((w) => w.h)) * 2;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Longest strictly increasing subsequence by line number (input is in screen order). */
function longestIncreasing(numbers: Number_[]): Number_[] {
  const length = numbers.map(() => 1);
  const previous = numbers.map(() => -1);
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < i; j++) {
      if (numbers[j].n < numbers[i].n && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1;
        previous[i] = j;
      }
    }
  }
  let end = length.indexOf(Math.max(...length));
  const result: Number_[] = [];
  for (; end >= 0; end = previous[end]) result.unshift(numbers[end]);
  return result;
}
