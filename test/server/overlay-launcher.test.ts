import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { launchOverlay, type LaunchedOverlay } from "../../src/server/overlay-launcher.js";

const fakeOverlay = path.resolve(__dirname, "../fixtures/fake-overlay.mjs");

const launchFake = (mode: string, connectTimeoutMs = 5000) =>
  launchOverlay({
    electronPath: process.execPath,
    mainPath: fakeOverlay,
    connectTimeoutMs,
    stopGraceMs: 300,
    env: { ...process.env, FAKE_OVERLAY: mode },
  });

const exited = (overlay: LaunchedOverlay) =>
  new Promise<number | null>((resolve) => overlay.onExit((code) => resolve(code)));

describe("launchOverlay", () => {
  let overlay: LaunchedOverlay | undefined;
  afterEach(async () => {
    await overlay?.stop();
    overlay = undefined;
  });

  it("starts the overlay and returns its connection", async () => {
    overlay = await launchFake("hello");
    expect(overlay.connection.display.boundsPhysical.w).toBe(1920);
  });

  it("starts Electron as Electron even when the agent runs inside VS Code", async () => {
    overlay = await launchOverlay({
      electronPath: process.execPath,
      mainPath: fakeOverlay,
      connectTimeoutMs: 5000,
      stopGraceMs: 300,
      env: { ...process.env, FAKE_OVERLAY: "hello", ELECTRON_RUN_AS_NODE: "1" },
    });
    expect(overlay.connection.display.boundsPhysical.w).toBe(1920);
  });

  it("keeps the overlay's stdout away from the MCP stdout", async () => {
    overlay = await launchFake("hello");
    expect(overlay.process.stdout).toBeNull();
  });

  it("fails clearly when the overlay exits before connecting", async () => {
    await expect(launchFake("crash-early")).rejects.toThrow(/exited.*code 3/);
  });

  it("fails and kills the process when the overlay never connects", async () => {
    await expect(launchFake("silent", 300)).rejects.toThrow(/did not connect/);
  });

  it("fails clearly when the executable does not exist", async () => {
    await expect(
      launchOverlay({ electronPath: "C:/nope/electron.exe", mainPath: fakeOverlay, connectTimeoutMs: 2000 }),
    ).rejects.toThrow(/start/i);
  });

  it("stops gracefully by asking the overlay to close", async () => {
    overlay = await launchFake("hello");
    const code = exited(overlay);
    await overlay.stop();
    expect(await code).toBe(0);
  });

  it("kills an overlay that ignores close after the grace period", async () => {
    overlay = await launchFake("stubborn");
    const code = exited(overlay);
    await overlay.stop();
    expect(overlay.process.exitCode !== null || overlay.process.signalCode !== null).toBe(true);
    await code;
  });

  it("reports an unexpected exit after connecting", async () => {
    overlay = await launchFake("crash-later");
    expect(await exited(overlay)).toBe(4);
  });

  it("can be stopped twice safely", async () => {
    overlay = await launchFake("hello");
    await overlay.stop();
    await expect(overlay.stop()).resolves.toBeUndefined();
  });
});
