import { describe, expect, it } from "vitest";
import { parseProbeArgs, runProbe, summarizeSnapshot } from "../../src/server/probe.js";
import { explorerAndTerminal } from "../fixtures/uia/vscode-layout.js";
import { FakeHelper } from "../helpers/fake-helper.js";

describe("summarizeSnapshot", () => {
  it("counts nodes, named nodes, documents, control types and classes", () => {
    const snapshot = explorerAndTerminal();
    const summary = summarizeSnapshot(snapshot, 3);
    expect(summary.nodes).toBe(snapshot.nodes.length);
    expect(summary.named).toBe(snapshot.nodes.filter((n) => n.n).length);
    expect(summary.documents).toBe(0);
    expect(summary.controlTypes.TabItem).toBeGreaterThan(0);
    expect(summary.topClasses).toHaveLength(3);
    expect(summary.topClasses[0].count).toBeGreaterThanOrEqual(summary.topClasses[1].count);
  });
});

describe("runProbe", () => {
  it("snapshots the topmost window of the process", async () => {
    const helper = new FakeHelper();
    helper.snapshot = explorerAndTerminal();
    const report = await runProbe(helper, { process: "Code" });
    expect(report.window).toEqual({ hwnd: 42, title: helper.windows[0].title, bounds: helper.windows[0].bounds });
    expect(helper.callsTo("uia_snapshot")[0].args).toEqual({ hwnd: 42, minNodes: 30, maxNodes: 20000 });
    expect(report.nodes).toBe(explorerAndTerminal().nodes.length);
    expect(report.snapshot).toBeUndefined();
  });

  it("picks the window whose title contains --title, ignoring case and diacritics", async () => {
    const helper = new FakeHelper();
    helper.snapshot = explorerAndTerminal();
    helper.windows = [{ ...helper.windows[0], hwnd: 1, title: "x.ts - other - Visual Studio Code" }, helper.windows[0]];
    const report = await runProbe(helper, { process: "Code", title: "FASTAPI" });
    expect(report.window?.hwnd).toBe(42);
  });

  it("reports no window and takes no snapshot when the process has none", async () => {
    const helper = new FakeHelper();
    const report = await runProbe(helper, { process: "chrome" });
    expect(report.window).toBeNull();
    expect(helper.callsTo("uia_snapshot")).toEqual([]);
  });
});

describe("parseProbeArgs", () => {
  it("reads process, title, max nodes and output file", () => {
    expect(parseProbeArgs(["chrome", "--title", "MDN", "--max-nodes", "8000", "--out", "x.json"])).toEqual({
      process: "chrome",
      title: "MDN",
      maxNodes: 8000,
      out: "x.json",
    });
  });
  it("needs a process and a positive integer for --max-nodes", () => {
    expect(parseProbeArgs([])).toHaveProperty("error");
    expect(parseProbeArgs(["chrome", "--max-nodes", "abc"])).toHaveProperty("error");
  });
});
