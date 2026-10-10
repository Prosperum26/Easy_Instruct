import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { helperBackends, type HelperBackend } from "../../src/helper-client/fallback.js";
import { HelperClient, HelperError } from "../../src/helper-client/helper-client.js";

// The same protocol checks against every way win-helper can run, so the backends never drift.
// A backend that cannot run on this machine (e.g. the unsigned exe under Smart App Control,
// or an exe that was not built) is skipped with a note.
const root = path.resolve(__dirname, "../..");
const backends: HelperBackend[] = [
  helperBackends(path.join(root, "native", "win-helper"), "powershell")[0],
  { name: "dotnet", command: path.join(root, "dist", "win-helper", "win-helper.exe"), args: [] },
];

function runs(backend: HelperBackend): boolean {
  const probe = spawnSync(backend.command, backend.args, {
    input: '{"id":1,"cmd":"ping"}\n',
    timeout: 30_000,
    windowsHide: true,
  });
  const ok = !probe.error && String(probe.stdout).includes('"pong":true');
  if (!ok) console.warn(`win-helper contract: skipping ${backend.name} (${probe.error?.message ?? "no pong"})`);
  return ok;
}

const PNG_SIGNATURE = "89504e470d0a1a0a";

for (const backend of backends) {
  describe.skipIf(!runs(backend))(`win-helper via ${backend.name}`, () => {
    let client: HelperClient;
    beforeAll(() => {
      client = new HelperClient({ command: backend.command, args: backend.args, requestTimeoutMs: 30_000 });
    });
    afterAll(() => client.close());

    const errorCode = async (promise: Promise<unknown>) => {
      const error = await promise.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(HelperError);
      return (error as HelperError).code;
    };

    it("answers ping", async () => {
      await expect(client.request("ping")).resolves.toEqual({ pong: true });
    });

    it("reports the primary display at the origin", async () => {
      const { bounds } = await client.request<{ bounds: { x: number; y: number; w: number; h: number } }>("display_info");
      expect(bounds).toMatchObject({ x: 0, y: 0 });
      expect(bounds.w).toBeGreaterThan(0);
      expect(bounds.h).toBeGreaterThan(0);
    });

    it("lists windows with the documented shape", async () => {
      const windows = await client.request<unknown[]>("list_windows");
      for (const window of windows) {
        expect(window).toEqual({
          hwnd: expect.any(Number),
          title: expect.any(String),
          process: expect.any(String),
          path: expect.any(String),
          bounds: { x: expect.any(Number), y: expect.any(Number), w: expect.any(Number), h: expect.any(Number) },
          minimized: expect.any(Boolean),
          foreground: expect.any(Boolean),
        });
      }
    });

    it("reports unknown windows and bad arguments with stable codes", async () => {
      expect(await errorCode(client.request("window_bounds", { hwnd: 1 }))).toBe("WINDOW_NOT_FOUND");
      expect(await errorCode(client.request("window_bounds", { hwnd: "x" }))).toBe("BAD_ARGS");
      expect(await errorCode(client.request("capture", { x: 0, y: 0, w: 0, h: 5 }))).toBe("BAD_ARGS");
      expect(await errorCode(client.request("teleport"))).toBe("UNKNOWN_COMMAND");
    });

    it("captures a region as a PNG of the requested size", async () => {
      const shot = await client.request<{ png: string; width: number; height: number; scale: number; origin: object }>(
        "capture",
        { x: 0, y: 0, w: 64, h: 32 },
      );
      const png = Buffer.from(shot.png, "base64");
      expect(png.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 32]);
      expect(shot).toMatchObject({ width: 64, height: 32, scale: 1, origin: { x: 0, y: 0 } });
    });

    it("shrinks captures with a grid and reports the scale", async () => {
      const shot = await client.request<{ width: number; height: number; scale: number }>("capture", {
        x: 0,
        y: 0,
        w: 400,
        h: 200,
        maxWidth: 100,
        grid: true,
      });
      expect(shot).toMatchObject({ width: 100, height: 50, scale: 0.25 });
    });

    it("exits on its own when its parent process dies, even with stdin still open", async () => {
      const parent = spawn(process.execPath, ["-e", "setTimeout(() => {}, 300)"]);
      const exitedParent = new Promise((resolve) => parent.once("exit", resolve));
      const args =
        backend.name === "powershell"
          ? helperBackends(path.join(root, "native", "win-helper"), "powershell", parent.pid!)[0].args
          : [`--parent-pid=${parent.pid}`];
      const child = spawn(backend.command, args, { stdio: "pipe", windowsHide: true });
      const exitedChild = new Promise((resolve) => child.once("exit", resolve));
      await exitedParent;
      const result = await Promise.race([
        exitedChild.then(() => "exited"),
        new Promise((resolve) => setTimeout(() => resolve("still running"), 8000)),
      ]);
      if (result !== "exited") child.kill();
      expect(result).toBe("exited");
    }, 20_000);

    it("snapshots a window's UI Automation tree as a flat list", async () => {
      const windows = await client.request<Array<{ hwnd: number; minimized: boolean }>>("list_windows");
      const target = windows.find((w) => !w.minimized);
      if (!target) return;
      const snapshot = await client.request<{
        window: number[];
        nodes: Array<{ p: number; d: number; t: string; n: string; id: string; c: string; r: number[] | null }>;
        truncated: boolean;
        attempts: number;
      }>("uia_snapshot", { hwnd: target.hwnd, maxNodes: 200 });
      expect(snapshot.window).toHaveLength(4);
      expect(snapshot.nodes[0]).toMatchObject({ p: -1, d: 0 });
      snapshot.nodes.forEach((node, i) => {
        expect(node).toEqual({
          p: expect.any(Number),
          d: expect.any(Number),
          t: expect.any(String),
          n: expect.any(String),
          id: expect.any(String),
          c: expect.any(String),
          r: node.r === null ? null : [expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)],
        });
        if (i > 0) expect(node.p).toBeLessThan(i);
      });
      expect(snapshot.nodes.length).toBeLessThanOrEqual(200);
    });

    it("reports unknown windows for uia_snapshot", async () => {
      expect(await errorCode(client.request("uia_snapshot", { hwnd: 1 }))).toBe("WINDOW_NOT_FOUND");
    });

    it("reads rendered text with OCR (self test)", async () => {
      const result = await client.request<{ ok: boolean; text: string; language: string; languages: string[] }>("ocr_selftest");
      expect(result.ok).toBe(true);
      expect(result.text).toContain("12345");
      expect(result.languages.length).toBeGreaterThan(0);
    });

    it("returns OCR lines and words with screen rects inside the region", async () => {
      const region = { x: 0, y: 0, w: 300, h: 200 };
      const result = await client.request<{
        language: string;
        lines: Array<{ text: string; rect: number[]; words: Array<{ text: string; rect: number[] }> }>;
      }>("ocr", region);
      expect(typeof result.language).toBe("string");
      for (const line of result.lines) {
        expect(line.words.length).toBeGreaterThan(0);
        for (const word of line.words) {
          expect(word.rect[0]).toBeGreaterThanOrEqual(region.x - 1);
          expect(word.rect[1]).toBeGreaterThanOrEqual(region.y - 1);
          expect(word.rect[0] + word.rect[2]).toBeLessThanOrEqual(region.x + region.w + 1);
        }
      }
    });

    it("reports a language without an OCR engine", async () => {
      expect(await errorCode(client.request("ocr", { x: 0, y: 0, w: 10, h: 10, lang: "xx-XX" }))).toBe("OCR_UNAVAILABLE");
    });

    it("keeps non-ASCII text intact", async () => {
      // Window titles are often Vietnamese; the encoding must survive both hosts.
      const windows = await client.request<Array<{ title: string }>>("list_windows");
      for (const { title } of windows) expect(title).not.toContain("�");
    });
  });
}
