import { describe, expect, it } from "vitest";
import { HelperError } from "../../src/helper-client/helper-client.js";
import type { HelperBackend } from "../../src/helper-client/fallback.js";
import { formatReport, isReady, runDoctor, type DoctorDeps, type ProbedHelper } from "../../src/server/doctor.js";

const dotnet: HelperBackend = { name: "dotnet", command: "win-helper.exe", args: [] };
const powershell: HelperBackend = { name: "powershell", command: "powershell.exe", args: [] };

/** A helper backend that answers the doctor's commands, or fails to start. */
function fakeHelper(answers: Record<string, unknown> | "broken", closed: string[], name: string): ProbedHelper {
  return {
    async request<T>(cmd: string): Promise<T> {
      if (answers === "broken") throw new HelperError("HELPER_UNAVAILABLE", "spawn UNKNOWN");
      if (!(cmd in answers)) throw new HelperError("UNKNOWN_COMMAND", cmd);
      const answer = answers[cmd];
      if (answer instanceof Error) throw answer;
      return answer as T;
    },
    async close() {
      closed.push(name);
    },
  };
}

const healthy = {
  ping: { pong: true },
  display_info: { bounds: { x: 0, y: 0, w: 2560, h: 1440 } },
  ocr_selftest: { ok: true, text: "EASY 12345", language: "en-US", languages: ["en-US"] },
  list_windows: [
    { hwnd: 1, title: "app.py - todo - Visual Studio Code", process: "Code", path: "C:/VSCode/Code.exe", bounds: { x: 0, y: 0, w: 10, h: 10 } },
  ],
};

function deps(overrides: Partial<DoctorDeps> & { answers?: Record<string, Record<string, unknown> | "broken"> } = {}) {
  const closed: string[] = [];
  const stopped: string[] = [];
  const cliFrom: Array<string | undefined> = [];
  const answers: Record<string, Record<string, unknown> | "broken"> = overrides.answers ?? { dotnet: healthy, powershell: healthy };
  const result: DoctorDeps = {
    platform: "win32",
    nodeVersion: "22.11.0",
    backends: [dotnet, powershell],
    connect: (backend) => fakeHelper(answers[backend.name] ?? "broken", closed, backend.name),
    findCodeCli: (fromWindow) => {
      cliFrom.push(fromWindow);
      return { exe: fromWindow ?? "C:/Users/me/AppData/Local/Programs/Microsoft VS Code/Code.exe", cliJs: "cli.js" };
    },
    launchOverlay: async () => ({ stop: async () => void stopped.push("overlay") }),
    guideFiles: () => ["SKILL.md", "references/targets.md"],
    ...overrides,
  };
  return { deps: result, closed, stopped, cliFrom };
}

const byId = (checks: Awaited<ReturnType<typeof runDoctor>>, id: string) => checks.find((check) => check.id === id);

describe("runDoctor", () => {
  it("reports a healthy machine as ready and cleans up after itself", async () => {
    const { deps: d, closed, stopped, cliFrom } = deps();
    const checks = await runDoctor(d);

    expect(checks.map((check) => [check.id, check.status])).toEqual([
      ["platform", "ok"],
      ["node", "ok"],
      ["helper_exe", "ok"],
      ["helper_powershell", "ok"],
      ["screen", "ok"],
      ["ocr", "ok"],
      ["vscode", "ok"],
      ["overlay", "ok"],
      ["guide", "ok"],
    ]);
    expect(isReady(checks)).toBe(true);
    expect(byId(checks, "screen")?.detail).toContain("2560×1440");
    // The CLI is looked up next to the open window's executable.
    expect(cliFrom).toEqual(["C:/VSCode/Code.exe"]);
    expect(byId(checks, "vscode")?.detail).toContain("app.py - todo");
    expect(closed.sort()).toEqual(["dotnet", "powershell"]);
    expect(stopped).toEqual(["overlay"]);
  });

  it("only warns when Smart App Control blocks the exe but PowerShell works", async () => {
    const { deps: d, closed } = deps({ answers: { dotnet: "broken", powershell: healthy } });
    const checks = await runDoctor(d);

    expect(byId(checks, "helper_exe")).toMatchObject({ status: "warn", detail: expect.stringContaining("spawn UNKNOWN") });
    expect(byId(checks, "helper_exe")?.fix).toContain("Smart App Control");
    expect(byId(checks, "helper_powershell")?.status).toBe("ok");
    expect(byId(checks, "ocr")?.status).toBe("ok");
    expect(isReady(checks)).toBe(true);
    expect(closed.sort()).toEqual(["dotnet", "powershell"]);
  });

  it("fails without any helper and skips what needs one", async () => {
    const { deps: d } = deps({ answers: { dotnet: "broken", powershell: "broken" } });
    const checks = await runDoctor(d);

    expect(byId(checks, "helper_powershell")?.status).toBe("fail");
    expect(byId(checks, "screen")?.status).toBe("skip");
    expect(byId(checks, "ocr")?.status).toBe("skip");
    // The CLI is still found from the usual install folders.
    expect(byId(checks, "vscode")?.status).toBe("ok");
    expect(isReady(checks)).toBe(false);
  });

  it("skips the exe check when the exe was not built", async () => {
    const { deps: d } = deps({ backends: [powershell] });
    const checks = await runDoctor(d);
    expect(byId(checks, "helper_exe")).toMatchObject({ status: "skip", detail: expect.stringContaining("Not built") });
    expect(isReady(checks)).toBe(true);
  });

  it("warns when OCR cannot read its test image or is missing", async () => {
    const misread = { ...healthy, ocr_selftest: { ok: false, text: "EASY", language: "vi", languages: ["vi"] } };
    let checks = await runDoctor(deps({ answers: { dotnet: misread, powershell: misread } }).deps);
    expect(byId(checks, "ocr")).toMatchObject({ status: "warn", detail: expect.stringContaining('"EASY"') });

    const missing = { ...healthy, ocr_selftest: new HelperError("OCR_UNAVAILABLE", "No OCR language installed.") };
    checks = await runDoctor(deps({ answers: { dotnet: missing, powershell: missing } }).deps);
    expect(byId(checks, "ocr")).toMatchObject({ status: "warn", detail: "No OCR language installed." });
    expect(isReady(checks)).toBe(true);
  });

  it("warns when VS Code's CLI is missing, and says whether a window is open", async () => {
    const noWindows = { ...healthy, list_windows: [] };
    const { deps: d } = deps({ answers: { dotnet: noWindows, powershell: noWindows }, findCodeCli: () => null });
    const check = byId(await runDoctor(d), "vscode");
    expect(check).toMatchObject({ status: "warn" });
    expect(check?.detail).toContain("No VS Code window is open");
  });

  it("fails when the overlay cannot start, and can skip it", async () => {
    const broken = deps({
      launchOverlay: async () => {
        throw new Error("The overlay exited before connecting (code 1).");
      },
    }).deps;
    const checks = await runDoctor(broken);
    expect(byId(checks, "overlay")).toMatchObject({ status: "fail", detail: expect.stringContaining("code 1") });
    expect(isReady(checks)).toBe(false);

    const skipped = await runDoctor(broken, { overlay: false });
    expect(byId(skipped, "overlay")?.status).toBe("skip");
    expect(isReady(skipped)).toBe(true);
  });

  it("refuses other platforms and old Node versions without starting anything", async () => {
    const { deps: d, closed } = deps({
      platform: "linux",
      nodeVersion: "18.19.0",
      connect: () => {
        throw new Error("must not start a helper");
      },
      launchOverlay: () => {
        throw new Error("must not start the overlay");
      },
    });
    const checks = await runDoctor(d);
    expect(byId(checks, "platform")?.status).toBe("fail");
    expect(byId(checks, "node")?.status).toBe("fail");
    expect(byId(checks, "overlay")?.status).toBe("skip");
    expect(closed).toEqual([]);
  });

  it("fails when the guide is missing", async () => {
    const checks = await runDoctor(deps({ guideFiles: () => [] }).deps);
    expect(byId(checks, "guide")?.status).toBe("fail");
  });
});

describe("formatReport", () => {
  it("lists each check with its fix and a verdict", async () => {
    const checks = await runDoctor(deps({ answers: { dotnet: "broken", powershell: healthy } }).deps);
    const report = formatReport(checks);
    expect(report).toMatch(/\[warn\] win-helper\.exe\s+Could not run/);
    expect(report).toContain("→ Fine if the PowerShell helper works");
    expect(report.trimEnd().split("\n").at(-1)).toBe("Ready, with 1 limitation (see warn above).");
  });

  it("says what blocks a lesson", async () => {
    const checks = await runDoctor(deps({ guideFiles: () => [] }).deps);
    expect(formatReport(checks).trimEnd().split("\n").at(-1)).toBe("Not ready: 1 problem to fix.");
  });
});
