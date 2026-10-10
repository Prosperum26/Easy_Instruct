import type { HelperBackend } from "../helper-client/fallback.js";
import type { Helper } from "../helper-client/helper.js";
import type { CodeCli } from "../ide/vscode-cli.js";
import { chooseIdeWindow, type WindowInfo } from "../ide/windows.js";
import type { Rect } from "../shared/geometry.js";

/**
 * `easy-instruct doctor`: checks, one by one, what this machine can do, so a lesson that will not
 * work fails here with a fix instead of halfway through. Everything it touches is injected.
 */
export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export interface ProbedHelper extends Helper {
  close(): Promise<void>;
}

export interface DoctorDeps {
  platform: string;
  nodeVersion: string;
  /** The helper backends the server would try, in order (see helperBackends). */
  backends: HelperBackend[];
  connect(backend: HelperBackend): ProbedHelper;
  findCodeCli(fromWindow?: string): CodeCli | null;
  /** Starts the real overlay; the doctor stops it as soon as it has connected. */
  launchOverlay(): Promise<{ stop(): Promise<void> }>;
  guideFiles(): string[];
  now?(): number;
}

export interface DoctorOptions {
  /** false skips starting the overlay (it shows nothing, but takes a second or two). */
  overlay?: boolean;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runDoctor(deps: DoctorDeps, options: DoctorOptions = {}): Promise<Check[]> {
  const now = deps.now ?? Date.now;
  const checks: Check[] = [];
  const windows = deps.platform === "win32";

  checks.push(
    windows
      ? { id: "platform", title: "Windows", status: "ok", detail: "win32" }
      : { id: "platform", title: "Windows", status: "fail", detail: `${deps.platform}: Easy Instruct runs on Windows 10/11 only.` },
  );

  const major = Number(deps.nodeVersion.split(".")[0]);
  checks.push(
    major >= 20
      ? { id: "node", title: "Node.js", status: "ok", detail: `v${deps.nodeVersion}` }
      : { id: "node", title: "Node.js", status: "fail", detail: `v${deps.nodeVersion}`, fix: "Install Node.js 20 or newer." },
  );

  // Every backend is probed, not just the first that works, so a blocked exe shows up as a warning.
  const probes = windows
    ? await Promise.all(
        deps.backends.map(async (backend) => {
          const helper = deps.connect(backend);
          const start = now();
          try {
            await helper.request("ping");
            return { backend, helper, ms: now() - start };
          } catch (error) {
            await helper.close().catch(() => {});
            return { backend, error: message(error) };
          }
        }),
      )
    : [];
  const working = probes.find((probe) => probe.helper);
  checks.push(...helperChecks(windows, deps.backends, probes));

  const helper = working?.helper;
  try {
    checks.push(await screenCheck(helper));
    checks.push(await ocrCheck(helper));
    checks.push(await vscodeCheck(helper, deps));
  } finally {
    await Promise.all(probes.map((probe) => probe.helper?.close().catch(() => {})));
  }

  if (options.overlay === false) {
    checks.push({ id: "overlay", title: "Overlay (Electron)", status: "skip", detail: "Skipped (--no-overlay)." });
  } else if (!windows) {
    checks.push({ id: "overlay", title: "Overlay (Electron)", status: "skip", detail: "Needs Windows." });
  } else {
    const start = now();
    try {
      const overlay = await deps.launchOverlay();
      await overlay.stop();
      checks.push({ id: "overlay", title: "Overlay (Electron)", status: "ok", detail: `Started and connected in ${now() - start} ms.` });
    } catch (error) {
      checks.push({
        id: "overlay",
        title: "Overlay (Electron)",
        status: "fail",
        detail: message(error),
        fix: "Run npm install again (it downloads Electron), then npm run build.",
      });
    }
  }

  const guide = deps.guideFiles();
  checks.push(
    guide.includes("SKILL.md")
      ? { id: "guide", title: "Agent guide", status: "ok", detail: `${guide.length} files (skills/easy-instruct).` }
      : { id: "guide", title: "Agent guide", status: "fail", detail: "skills/easy-instruct/SKILL.md is missing.", fix: "Reinstall: the package is incomplete." },
  );

  return checks;
}

type Probe = { backend: HelperBackend; helper?: ProbedHelper; ms?: number; error?: string };

function helperChecks(windows: boolean, backends: HelperBackend[], probes: Probe[]): Check[] {
  if (!windows) return [{ id: "helper", title: "win-helper", status: "skip", detail: "Needs Windows." }];
  const result = (name: string) => probes.find((probe) => probe.backend.name === name);
  const checks: Check[] = [];

  const exe = result("dotnet");
  if (!backends.some((backend) => backend.name === "dotnet")) {
    checks.push({
      id: "helper_exe",
      title: "win-helper.exe",
      status: "skip",
      detail: "Not built (no .NET SDK when building); the PowerShell helper is used.",
    });
  } else if (exe?.helper) {
    checks.push({ id: "helper_exe", title: "win-helper.exe", status: "ok", detail: `Answered in ${exe.ms} ms.` });
  } else {
    checks.push({
      id: "helper_exe",
      title: "win-helper.exe",
      status: "warn",
      detail: `Could not run: ${exe?.error}`,
      fix: "Fine if the PowerShell helper works (it is a little slower to start). Usual causes: Smart App Control blocks the unsigned exe, or the .NET 10 runtime is missing.",
    });
  }

  const ps = result("powershell");
  if (ps?.helper) {
    checks.push({ id: "helper_powershell", title: "win-helper (PowerShell)", status: "ok", detail: `Compiled and answered in ${ps.ms} ms.` });
  } else if (ps) {
    checks.push({
      id: "helper_powershell",
      title: "win-helper (PowerShell)",
      status: exe?.helper ? "warn" : "fail",
      detail: `Could not run: ${ps.error}`,
      fix: exe?.helper
        ? "Only needed when the exe cannot run."
        : "Without a helper there is no observe and no smart targets. Check that Windows PowerShell 5.1 runs and that scripts are not blocked by policy.",
    });
  }
  return checks;
}

async function screenCheck(helper?: ProbedHelper): Promise<Check> {
  if (!helper) return { id: "screen", title: "Screen capture", status: "skip", detail: "Needs a working helper." };
  try {
    const { bounds } = await helper.request<{ bounds: Rect }>("display_info");
    return { id: "screen", title: "Screen capture", status: "ok", detail: `Primary screen ${bounds.w}×${bounds.h} physical pixels.` };
  } catch (error) {
    return { id: "screen", title: "Screen capture", status: "fail", detail: message(error) };
  }
}

async function ocrCheck(helper?: ProbedHelper): Promise<Check> {
  if (!helper) return { id: "ocr", title: "Windows OCR", status: "skip", detail: "Needs a working helper." };
  const fix =
    "text targets fall back to UI Automation names, and lines targets need OCR. Add a language with OCR in Settings > Time & language > Language & region.";
  try {
    const result = await helper.request<{ ok: boolean; text: string; language: string; languages: string[] }>("ocr_selftest");
    if (result.ok) {
      return { id: "ocr", title: "Windows OCR", status: "ok", detail: `${result.language} (available: ${result.languages.join(", ")}).` };
    }
    return { id: "ocr", title: "Windows OCR", status: "warn", detail: `Read "${result.text}" instead of "EASY 12345".`, fix };
  } catch (error) {
    return { id: "ocr", title: "Windows OCR", status: "warn", detail: message(error), fix };
  }
}

async function vscodeCheck(helper: ProbedHelper | undefined, deps: DoctorDeps): Promise<Check> {
  let window: WindowInfo | null = null;
  if (helper) {
    try {
      const windows = await helper.request<WindowInfo[]>("list_windows", { process: "Code" });
      window = chooseIdeWindow(windows);
    } catch {
      // Finding the CLI below works without a window.
    }
  }
  const cli = deps.findCodeCli(window?.path);
  const open = window ? ` Open window: "${window.title}".` : " No VS Code window is open right now.";
  if (cli) return { id: "vscode", title: "VS Code", status: "ok", detail: `${cli.exe}.${open}` };
  return {
    id: "vscode",
    title: "VS Code",
    status: "warn",
    detail: `VS Code's command line (cli.js) was not found.${open}`,
    fix: "Install VS Code (user or system installer). Without the CLI, lines targets and open_location ask the user to open files.",
  };
}

const LABEL: Record<CheckStatus, string> = { ok: "[ ok ]", warn: "[warn]", fail: "[FAIL]", skip: "[skip]" };

export function isReady(checks: Check[]): boolean {
  return !checks.some((check) => check.status === "fail");
}

export function formatReport(checks: Check[]): string {
  const width = Math.max(...checks.map((check) => check.title.length));
  const lines = ["Easy Instruct doctor", ""];
  for (const check of checks) {
    lines.push(`${LABEL[check.status]} ${check.title.padEnd(width)}  ${check.detail}`);
    if (check.fix && check.status !== "ok") lines.push(`${" ".repeat(width + 9)}→ ${check.fix}`);
  }
  const warnings = checks.filter((check) => check.status === "warn").length;
  const failures = checks.filter((check) => check.status === "fail").length;
  lines.push("");
  if (failures) lines.push(`Not ready: ${failures} problem${failures > 1 ? "s" : ""} to fix.`);
  else if (warnings) lines.push(`Ready, with ${warnings} limitation${warnings > 1 ? "s" : ""} (see warn above).`);
  else lines.push("Ready.");
  return lines.join("\n");
}
