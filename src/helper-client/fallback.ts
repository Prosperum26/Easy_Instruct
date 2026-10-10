import { existsSync } from "node:fs";
import path from "node:path";
import type { HelperEvent } from "./helper.js";
import { HelperClient, HelperError } from "./helper-client.js";

export interface HelperBackend {
  name: string;
  command: string;
  args: string[];
}

/**
 * Ways to run win-helper from `dir` (dist/win-helper), in the order to try them:
 * the .NET exe (fast, but Smart App Control blocks it because it is unsigned), then the same
 * sources compiled by Windows PowerShell (signed by Microsoft). `preference` comes from
 * EASY_INSTRUCT_HELPER: "dotnet", "powershell" or "auto".
 */
export function helperBackends(dir: string, preference = "auto", parentPid = process.pid): HelperBackend[] {
  const exe = path.join(dir, "win-helper.exe");
  // The helper exits when this process dies, even if it is killed before closing the helper's stdin.
  const dotnet: HelperBackend = { name: "dotnet", command: exe, args: [`--parent-pid=${parentPid}`] };
  const powershell: HelperBackend = {
    name: "powershell",
    command: path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(dir, "host.ps1"),
      "-ParentPid",
      String(parentPid),
    ],
  };
  if (preference === "dotnet") return [dotnet];
  if (preference === "powershell") return [powershell];
  return existsSync(exe) ? [dotnet, powershell] : [powershell];
}

/**
 * Sends requests to the first backend that works. A backend that cannot start, or dies before
 * it has answered anything, is skipped for the next one; once a backend has answered, it is kept
 * (its own client restarts it once) and its errors are passed through.
 */
export class FallbackHelper {
  private readonly clients: Array<{ name: string; client: HelperClient; answered: boolean }>;
  private index = 0;
  private readonly eventListeners: Array<(event: HelperEvent) => void> = [];

  constructor(backends: HelperBackend[], requestTimeoutMs?: number) {
    this.clients = backends.map((backend) => ({
      name: backend.name,
      client: new HelperClient({ command: backend.command, args: backend.args, requestTimeoutMs }),
      answered: false,
    }));
    this.clients.forEach((entry, i) =>
      entry.client.onEvent((event) => {
        if (i === this.index) this.eventListeners.forEach((listener) => listener(event));
      }),
    );
  }

  /** Events from the backend in use. */
  onEvent(listener: (event: HelperEvent) => void) {
    this.eventListeners.push(listener);
  }

  get activeBackend(): string | undefined {
    return this.clients[this.index]?.name;
  }

  async request<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    while (this.index < this.clients.length) {
      const current = this.clients[this.index];
      try {
        const result = await current.client.request<T>(cmd, args);
        current.answered = true;
        return result;
      } catch (error) {
        if (!(error instanceof HelperError)) throw error;
        const broken = error.code === "HELPER_UNAVAILABLE" || (error.code === "HELPER_EXITED" && !current.answered);
        if (!broken) throw error;
        void current.client.close();
        this.index++;
      }
    }
    throw new HelperError("HELPER_UNAVAILABLE", "No win-helper backend could run on this machine.");
  }

  async close(): Promise<void> {
    await Promise.all(this.clients.map(({ client }) => client.close()));
  }
}
