import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HelperClient, HelperError } from "../../src/helper-client/helper-client.js";

const fakeHelper = path.resolve(__dirname, "../fixtures/fake-helper.mjs");

describe("HelperClient", () => {
  let client: HelperClient;
  const start = (requestTimeoutMs = 2000) =>
    (client = new HelperClient({ command: process.execPath, args: [fakeHelper], requestTimeoutMs }));

  afterEach(() => client?.close());

  const errorCode = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HelperError);
    return (error as HelperError).code;
  };

  it("returns results", async () => {
    start();
    await expect(client.request("echo", { a: 1 })).resolves.toEqual({ a: 1 });
  });

  it("turns helper errors into HelperErrors with their code", async () => {
    start();
    expect(await errorCode(client.request("fail"))).toBe("WINDOW_NOT_FOUND");
  });

  it("matches out-of-order responses to their requests", async () => {
    start();
    const slow = client.request("delay", { ms: 150, v: "slow" });
    const fast = client.request("delay", { ms: 10, v: "fast" });
    await expect(Promise.all([slow, fast])).resolves.toEqual([{ v: "slow" }, { v: "fast" }]);
  });

  it("ignores lines that are not JSON", async () => {
    start();
    await expect(client.request("garbage")).resolves.toEqual({ ok: true });
  });

  it("times out requests that get no answer", async () => {
    start(100);
    expect(await errorCode(client.request("silent"))).toBe("TIMEOUT");
    await expect(client.request("echo", { still: "works" })).resolves.toEqual({ still: "works" });
  });

  it("fails pending requests when the helper dies and restarts it once", async () => {
    start();
    const firstPid = await client.request("pid");
    expect(await errorCode(client.request("die"))).toBe("HELPER_EXITED");
    const secondPid = await client.request("pid");
    expect(secondPid).not.toBe(firstPid);
  });

  it("gives up after the restart also dies", async () => {
    start();
    await errorCode(client.request("die"));
    await errorCode(client.request("die"));
    expect(await errorCode(client.request("echo"))).toBe("HELPER_UNAVAILABLE");
  });

  it("reports a missing executable as unavailable", async () => {
    client = new HelperClient({ command: "C:/nope/win-helper.exe", args: [], requestTimeoutMs: 2000 });
    expect(await errorCode(client.request("echo"))).toBe("HELPER_UNAVAILABLE");
  });

  it("reports spawn failures that throw synchronously as unavailable", async () => {
    client = new HelperClient({ command: "bad\0path.exe", args: [], requestTimeoutMs: 2000 });
    expect(await errorCode(client.request("echo"))).toBe("HELPER_UNAVAILABLE");
  });

  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it("waits for the helper to exit on close", async () => {
    start();
    const pid = await client.request<number>("pid");
    await client.close();
    expect(alive(pid)).toBe(false);
  });

  it("kills a helper that keeps running after stdin closes", async () => {
    process.env.FAKE_HELPER_IGNORE_EOF = "1";
    try {
      client = new HelperClient({ command: process.execPath, args: [fakeHelper], closeGraceMs: 200 });
      const pid = await client.request<number>("pid");
      await client.close();
      expect(alive(pid)).toBe(false);
    } finally {
      delete process.env.FAKE_HELPER_IGNORE_EOF;
    }
  });

  it("rejects requests after close", async () => {
    start();
    client.close();
    expect(await errorCode(client.request("echo"))).toBe("HELPER_UNAVAILABLE");
  });
});
