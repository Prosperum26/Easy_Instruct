import { union, type Rect } from "../shared/geometry.js";
import type { UiaTree } from "./uia.js";

export interface OcrWordResult {
  text: string;
  rect: Rect;
}

export interface OcrLine {
  text: string;
  words: OcrWordResult[];
}

export interface TextMatch {
  rect: Rect;
  method: "uia" | "ocr";
  confidence: number;
}

export interface FindOptions {
  /** Only matches whose centre is inside this area. */
  within?: Rect;
  /** 1-based, in reading order. */
  occurrence?: number;
}

/** Lower case, no diacritics (đ included), single spaces: OCR engines without Vietnamese drop the marks. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Equal after normalising, allowing 1 OCR slip from 7 characters and 2 from 12 (e.g. "rn" read for "m"). */
export function similarText(a: string, b: string): boolean {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (x === y) return true;
  const length = Math.max(x.length, y.length);
  const allowed = length >= 12 ? 2 : length >= 7 ? 1 : 0;
  return allowed > 0 && Math.abs(x.length - y.length) <= allowed && levenshtein(x, y) <= allowed;
}

/** VS Code appends shortcuts to names: "Search (Ctrl+Shift+F)". */
const withoutShortcut = (name: string) => name.replace(/\s*\([^()]*\)\s*$/, "");

/**
 * Finds an element by its accessible name: exact (confidence 1), then without the trailing
 * shortcut (0.95), then with OCR-style slips (0.8). Among elements with the same rect the
 * deepest wins; results are in reading order.
 */
export function findTextInUia(tree: UiaTree, text: string, options: FindOptions = {}): TextMatch | null {
  const wanted = normalizeText(text);
  const candidates: Array<{ rect: Rect; depth: number; confidence: number }> = [];
  for (const node of tree.nodes) {
    if (!node.n) continue;
    const rect = tree.visibleRect(node);
    if (!rect || !inside(rect, options.within)) continue;
    const confidence =
      normalizeText(node.n) === wanted ? 1 : normalizeText(withoutShortcut(node.n)) === wanted ? 0.95 : similarText(withoutShortcut(node.n), text) ? 0.8 : 0;
    if (confidence > 0) candidates.push({ rect, depth: node.d, confidence });
  }

  const best = bestTier(candidates);
  const byRect = new Map<string, (typeof best)[number]>();
  for (const candidate of best) {
    const key = JSON.stringify(candidate.rect);
    const existing = byRect.get(key);
    if (!existing || candidate.depth > existing.depth) byRect.set(key, candidate);
  }
  const match = pick([...byRect.values()], options.occurrence);
  return match ? { rect: match.rect, method: "uia", confidence: match.confidence } : null;
}

/** Finds a phrase in OCR output, word by word within a line. Exact: 0.85, with slips: 0.7. */
export function findTextInOcr(lines: OcrLine[], text: string, options: FindOptions = {}): TextMatch | null {
  const tokens = normalizeText(text).split(" ");
  const candidates: Array<{ rect: Rect; confidence: number }> = [];
  for (const line of lines) {
    for (let i = 0; i + tokens.length <= line.words.length; i++) {
      const words = line.words.slice(i, i + tokens.length);
      if (!words.every((w, k) => similarText(w.text, tokens[k]))) continue;
      const rect = union(words.map((w) => w.rect))!;
      if (!inside(rect, options.within)) continue;
      const exact = words.every((w, k) => normalizeText(w.text) === tokens[k]);
      candidates.push({ rect, confidence: exact ? 0.85 : 0.7 });
    }
  }
  const match = pick(bestTier(candidates), options.occurrence);
  return match ? { rect: match.rect, method: "ocr", confidence: match.confidence } : null;
}

function inside(rect: Rect, within?: Rect): boolean {
  if (!within) return true;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return cx >= within.x && cx < within.x + within.w && cy >= within.y && cy < within.y + within.h;
}

function bestTier<T extends { confidence: number }>(candidates: T[]): T[] {
  const top = Math.max(0, ...candidates.map((c) => c.confidence));
  return candidates.filter((c) => c.confidence === top);
}

/** The n-th candidate in reading order (top to bottom, then left to right). */
function pick<T extends { rect: Rect }>(candidates: T[], occurrence = 1): T | undefined {
  const sorted = [...candidates].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return sorted[occurrence - 1];
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}
