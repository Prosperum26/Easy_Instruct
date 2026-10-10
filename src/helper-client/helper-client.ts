import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type { HelperEvent } from "./helper.js";

export type HelperErrorCode = "TIMEOUT" | "HELPER_EXITED" | "HELPER_UNAVAILABLE" | (string & {});

export class HelperError extends Error {
  constructor(
    readonly code: HelperErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface HelperClientOptions {
  command: string;
  args: string[];
  requestTimeoutMs?: number;
  /** How long close() waits for the helper to exit after closing its stdin before killing it. */
  closeGraceMs?: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: HelperError) => void;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_RESTARTS = 1;
const DEBUG = process.env.EASY_INSTRUCT_DEBUG === "1";

/**
 * Talks to win-helper over JSON lines. Starts it on first use, matches responses by id,
 * times out silent requests, and restarts it once if it dies; after that every request
 * fails with HELPER_UNAVAILABLE so callers can fall back.
 */
export class HelperClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private childExited: Promise<void> = Promise.resolve();
  private readonly pending = new Map<number, Pending>();
  private readonly eventListeners: Array<(event: HelperEvent) => void> = [];
  private nextId = 1;
  private starts = 0;
  private unavailable: string | null = null;
  private readonly requestTimeoutMs: number;
  private readonly killOnExit = () => this.child?.kill();

  constructor(private readonly options: HelperClientOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    process.once("exit", this.killOnExit);
  }

  request<T = unknown>(cmd: string, args?: Record<string, unknown>, timeoutMs = this.requestTimeoutMs): Promise<T> {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.ensureStarted();
    } catch (error) {
      return Promise.reject(error);
    }

    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HelperError("TIMEOUT", `win-helper did not answer "${cmd}" within ${timeoutMs} ms.`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`);
    });
  }

  onEvent(listener: (event: HelperEvent) => void) {
    this.eventListeners.push(listener);
  }

  /**
   * Stops the helper: closes its stdin (it exits on EOF) and kills it if it is still running after
   * the grace period, e.g. because another process inherited its pipe and EOF never arrives.
   */
  async close(): Promise<void> {
    this.unavailable ??= "win-helper was closed.";
    this.failAll(new HelperError("HELPER_UNAVAILABLE", this.unavailable));
    const child = this.child;
    this.child = null;
    if (child) {
      child.stdin.end();
      const graceful = await Promise.race([
        this.childExited.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), this.options.closeGraceMs ?? 1000)),
      ]);
      if (!graceful) {
        child.kill();
        await this.childExited;
      }
    }
    process.off("exit", this.killOnExit);
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.unavailable) throw new HelperError("HELPER_UNAVAILABLE", this.unavailable);
    if (this.child) return this.child;
    if (this.starts > MAX_RESTARTS) {
      this.unavailable = "win-helper kept exiting.";
      throw new HelperError("HELPER_UNAVAILABLE", this.unavailable);
    }
    this.starts++;

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.options.command, this.options.args, { stdio: "pipe", windowsHide: true });
    } catch (error) {
      // Some failures (e.g. blocked by Windows App Control, invalid paths) throw instead of emitting "error".
      this.unavailable = `win-helper could not start: ${(error as Error).message}`;
      throw new HelperError("HELPER_UNAVAILABLE", this.unavailable);
    }
    this.child = child;
    this.childExited = new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.once("error", () => resolve());
    });
    child.stdin.on("error", () => {});
    child.stderr.on("data", (chunk) => {
      if (DEBUG) process.stderr.write(chunk);
    });
    readline.createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));

    child.once("error", (error) => {
      this.unavailable = `win-helper could not start: ${error.message}`;
      if (this.child === child) this.child = null;
      this.failAll(new HelperError("HELPER_UNAVAILABLE", this.unavailable));
    });
    child.once("exit", (code) => {
      if (this.child === child) this.child = null;
      this.failAll(new HelperError("HELPER_EXITED", `win-helper exited (code ${code}).`));
    });
    return child;
  }

  private handleLine(line: string) {
    let response: { id?: number; ok?: boolean; result?: unknown; error?: { code: string; message: string }; event?: unknown };
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    if (response.id === undefined && typeof response.event === "string") {
      this.eventListeners.forEach((listener) => listener(response as HelperEvent));
      return;
    }
    const pending = typeof response.id === "number" ? this.pending.get(response.id) : undefined;
    if (!pending) return;
    this.pending.delete(response.id!);
    clearTimeout(pending.timer);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new HelperError(response.error?.code ?? "INTERNAL", response.error?.message ?? "Unknown error"));
  }

  private failAll(error: HelperError) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
