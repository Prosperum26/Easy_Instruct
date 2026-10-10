import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserEvent } from "../../src/session/session.js";
import { EventWaiter, WaitInProgressError } from "../../src/session/waiter.js";

describe("EventWaiter", () => {
  let queue: UserEvent[];
  let waiter: EventWaiter;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = [];
    waiter = new EventWaiter(() => queue.shift());
  });
  afterEach(() => vi.useRealTimers());

  it("returns a queued event right away", async () => {
    queue.push({ event: "next", stepId: "s1" });
    await expect(waiter.wait(1000)).resolves.toEqual({ event: "next", stepId: "s1" });
  });

  it("resolves when an event arrives and notify is called", async () => {
    const pending = waiter.wait(1000);
    queue.push({ event: "done", stepId: "s2" });
    waiter.notify();
    await expect(pending).resolves.toEqual({ event: "done", stepId: "s2" });
  });

  it("keeps waiting when notified without an event", async () => {
    const pending = waiter.wait(1000);
    waiter.notify();
    queue.push({ event: "next", stepId: "s1" });
    waiter.notify();
    await expect(pending).resolves.toEqual({ event: "next", stepId: "s1" });
  });

  it("times out with a timeout event", async () => {
    const pending = waiter.wait(1000);
    vi.advanceTimersByTime(1000);
    await expect(pending).resolves.toEqual({ event: "timeout" });
  });

  it("rejects a second wait while one is pending", async () => {
    const first = waiter.wait(1000);
    await expect(waiter.wait(1000)).rejects.toBeInstanceOf(WaitInProgressError);
    vi.advanceTimersByTime(1000);
    await first;
  });

  it("allows a new wait after the previous one finished", async () => {
    const first = waiter.wait(1000);
    vi.advanceTimersByTime(1000);
    await first;
    queue.push({ event: "next", stepId: "s1" });
    await expect(waiter.wait(1000)).resolves.toEqual({ event: "next", stepId: "s1" });
  });

  it("rejects and frees the slot when the request is cancelled", async () => {
    const controller = new AbortController();
    const pending = waiter.wait(1000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/cancel/i);
    queue.push({ event: "next", stepId: "s1" });
    await expect(waiter.wait(1000)).resolves.toEqual({ event: "next", stepId: "s1" });
  });

  it("does not fire the timeout after an event resolved the wait", async () => {
    const pending = waiter.wait(1000);
    queue.push({ event: "next", stepId: "s1" });
    waiter.notify();
    await pending;
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
