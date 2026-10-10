import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { helperBackends, FallbackHelper } from "../../src/helper-client/fallback.js";
import { HelperError } from "../../src/helper-client/helper-client.js";

const fakeHelper = path.resolve(__dirname, "../fixtures/fake-helper.mjs");
const works = { name: "works", command: process.execPath, args: [fakeHelper] };
const alsoWorks = { name: "also-works", command: process.execPath, args: [fakeHelper] };
const cannotStart = { name: "cannot-start", command: "bad\0path.exe", args: [] };
const diesAtOnce = { name: "dies-at-once", command: process.execPath, args: ["-e", "process.exit(3)"] };

describe("FallbackHelper", () => {
  let helper: FallbackHelper;
  afterEach(() => helper?.close());

  const errorCode = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HelperError);
    return (error as HelperError).code;
  };

  it("uses the first backend that works", async () => {
    helper = new FallbackHelper([works, alsoWorks]);
    await expect(helper.request("echo", { a: 1 })).resolves.toEqual({ a: 1 });
    expect(helper.activeBackend).toBe("works");
  });

  it("falls back when a backend cannot start", async () => {
    helper = new FallbackHelper([cannotStart, works]);
    await expect(helper.request("echo", { a: 1 })).resolves.toEqual({ a: 1 });
    expect(helper.activeBackend).toBe("works");
  });

  it("falls back when a backend dies before answering anything", async () => {
    helper = new FallbackHelper([diesAtOnce, works]);
    await expect(helper.request("echo", { a: 2 })).resolves.toEqual({ a: 2 });
    expect(helper.activeBackend).toBe("works");
  });

  it("keeps a backend that has answered and passes its errors through", async () => {
    helper = new FallbackHelper([works, alsoWorks]);
    await helper.request("echo");
    expect(await errorCode(helper.request("fail"))).toBe("WINDOW_NOT_FOUND");
    expect(helper.activeBackend).toBe("works");
  });

  it("reports unavailable when every backend fails", async () => {
    helper = new FallbackHelper([cannotStart, diesAtOnce]);
    expect(await errorCode(helper.request("echo"))).toBe("HELPER_UNAVAILABLE");
  });
});

describe("helperBackends", () => {
  const dirWithExe = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ei-helper-"));
    writeFileSync(path.join(dir, "win-helper.exe"), "");
    return dir;
  };

  it("tries the exe first, then PowerShell", () => {
    const dir = dirWithExe();
    const backends = helperBackends(dir, "auto", 4242);
    expect(backends.map((b) => b.name)).toEqual(["dotnet", "powershell"]);
    expect(backends[0]).toMatchObject({ command: path.join(dir, "win-helper.exe"), args: ["--parent-pid=4242"] });
    expect(backends[1].args).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(dir, "host.ps1"),
      "-ParentPid",
      "4242",
    ]);
  });

  it("skips the exe when it was not built", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ei-helper-"));
    expect(helperBackends(dir, "auto").map((b) => b.name)).toEqual(["powershell"]);
  });

  it("honours an explicit choice", () => {
    const dir = dirWithExe();
    expect(helperBackends(dir, "powershell").map((b) => b.name)).toEqual(["powershell"]);
    expect(helperBackends(dir, "dotnet").map((b) => b.name)).toEqual(["dotnet"]);
  });

  it("treats unknown choices as auto", () => {
    expect(helperBackends(dirWithExe(), "banana").map((b) => b.name)).toEqual(["dotnet", "powershell"]);
  });
});
