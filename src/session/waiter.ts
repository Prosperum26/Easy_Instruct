import type { UserEvent } from "./session.js";

export type WaitResult = UserEvent | { event: "timeout" };

export class WaitInProgressError extends Error {
  constructor() {
    super("Another wait_for_user call is already waiting for the user.");
  }
}

interface Pending {
  resolve: (result: WaitResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort: () => void;
}

/**
 * Lets one caller at a time block until the next user event. Call `notify()` whenever
 * the event source may have new events.
 */
export class EventWaiter {
  private pending: Pending | null = null;

  constructor(private readonly take: () => UserEvent | undefined) {}

  wait(timeoutMs: number, signal?: AbortSignal): Promise<WaitResult> {
    if (this.pending) return Promise.reject(new WaitInProgressError());
    const ready = this.take();
    if (ready) return Promise.resolve(ready);
    if (signal?.aborted) return Promise.reject(new Error("wait_for_user was cancelled"));

    return new Promise<WaitResult>((resolve, reject) => {
      const onAbort = () => this.settle((p) => p.reject(new Error("wait_for_user was cancelled")));
      const timer = setTimeout(() => this.settle((p) => p.resolve({ event: "timeout" })), timeoutMs);
      this.pending = { resolve, reject, timer, signal, onAbort };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  notify() {
    if (!this.pending) return;
    const event = this.take();
    if (event) this.settle((p) => p.resolve(event));
  }

  private settle(finish: (pending: Pending) => void) {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.signal?.removeEventListener("abort", pending.onAbort);
    finish(pending);
  }
}
