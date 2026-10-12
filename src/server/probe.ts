import type { Helper } from "../helper-client/helper.js";
import type { WindowInfo } from "../ide/windows.js";
import { normalizeText } from "../locator/text.js";
import type { UiaSnapshot } from "../locator/uia.js";
import type { Rect } from "../shared/geometry.js";

export interface SnapshotSummary {
  nodes: number;
  /** Nodes with a non-empty name. */
  named: number;
  /** Nodes whose control type is Document (the web page in a browser). */
  documents: number;
  controlTypes: Record<string, number>;
  /** Most common classes, by count descending, then name ascending. */
  topClasses: Array<{ name: string; count: number }>;
}

export function summarizeSnapshot(snapshot: UiaSnapshot, top = 20): SnapshotSummary {
  const controlTypes: Record<string, number> = {};
  const classes = new Map<string, number>();
  let named = 0;
  let documents = 0;
  for (const node of snapshot.nodes) {
    if (node.n) named++;
    if (node.t === "Document") documents++;
    controlTypes[node.t] = (controlTypes[node.t] ?? 0) + 1;
    for (const name of node.c.split(/\s+/).filter(Boolean)) classes.set(name, (classes.get(name) ?? 0) + 1);
  }
  const topClasses = [...classes]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, top);
  return { nodes: snapshot.nodes.length, named, documents, controlTypes, topClasses };
}

export interface ProbeReport extends Partial<SnapshotSummary> {
  process: string;
  window: { hwnd: number; title: string; bounds: Rect } | null;
  truncated?: boolean;
  attempts?: number;
  ms?: number;
  snapshot?: UiaSnapshot;
}

export interface ProbeOptions {
  process: string;
  title?: string;
  minNodes?: number;
  maxNodes?: number;
  includeSnapshot?: boolean;
}

/** Snapshots one window of a process and reports what UI Automation exposes. */
export async function runProbe(helper: Helper, options: ProbeOptions): Promise<ProbeReport> {
  const { process, title, minNodes = 30, maxNodes = 20000, includeSnapshot = false } = options;
  const windows = await helper.request<WindowInfo[]>("list_windows", { process });
  const wanted = title ? normalizeText(title) : "";
  const chosen = (wanted && windows.find((w) => normalizeText(w.title).includes(wanted))) || windows[0];
  if (!chosen) return { process, window: null };

  const snapshot = await helper.request<UiaSnapshot>("uia_snapshot", { hwnd: chosen.hwnd, minNodes, maxNodes });
  const report: ProbeReport = {
    process,
    window: { hwnd: chosen.hwnd, title: chosen.title, bounds: chosen.bounds },
    ...summarizeSnapshot(snapshot),
    truncated: snapshot.truncated,
    attempts: snapshot.attempts,
    ms: snapshot.ms,
  };
  if (includeSnapshot) report.snapshot = snapshot;
  return report;
}

export const PROBE_USAGE = "easy-instruct probe <process> [--title <text>] [--max-nodes <n>] [--out <file>]";

export function parseProbeArgs(argv: string[]): { process: string; title?: string; maxNodes?: number; out?: string } | { error: string } {
  const result: { process: string; title?: string; maxNodes?: number; out?: string } = { process: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title" || arg === "--out" || arg === "--max-nodes") {
      const value = argv[++i];
      if (value === undefined) return { error: `${arg} needs a value` };
      if (arg === "--title") result.title = value;
      else if (arg === "--out") result.out = value;
      else {
        if (!/^\d+$/.test(value) || Number(value) < 1) return { error: "--max-nodes needs a positive integer" };
        result.maxNodes = Number(value);
      }
    } else if (arg.startsWith("--")) return { error: `Unknown option ${arg}` };
    else if (!result.process) result.process = arg;
    else return { error: `Unexpected argument ${arg}` };
  }
  if (!result.process) return { error: "A process name is needed, e.g. chrome" };
  return result;
}
