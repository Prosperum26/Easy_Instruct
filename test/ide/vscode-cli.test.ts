import path from "node:path";
import { describe, expect, it } from "vitest";
import { openLocation, openLocationCommand, resolveCodeCli, type FileSystem } from "../../src/ide/vscode-cli.js";

const install = "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code";
const exe = path.join(install, "Code.exe");

const fakeFs = (files: Record<string, string>): FileSystem => ({
  exists: (p) => p in files,
  read: (p) => {
    if (!(p in files)) throw new Error(`ENOENT ${p}`);
    return files[p];
  },
  list: (dir) => Object.keys(files).filter((p) => path.dirname(p) === dir).map((p) => path.basename(p)),
});

const CODE_CMD = [
  "@echo off",
  "setlocal",
  "set VSCODE_DEV=",
  "set ELECTRON_RUN_AS_NODE=1",
  '"%~dp0..\\Code.exe" "%~dp0..\\2a59476c9b\\resources\\app\\out\\cli.js" %*',
  "endlocal",
].join("\r\n");

describe("resolveCodeCli", () => {
  it("reads the versioned cli.js path from bin\\code.cmd", () => {
    const cliJs = path.join(install, "2a59476c9b", "resources", "app", "out", "cli.js");
    const fs = fakeFs({ [exe]: "", [path.join(install, "bin", "code.cmd")]: CODE_CMD, [cliJs]: "" });
    expect(resolveCodeCli([exe], fs)).toEqual({ exe, cliJs });
  });

  it("falls back to the classic resources folder", () => {
    const cliJs = path.join(install, "resources", "app", "out", "cli.js");
    expect(resolveCodeCli([exe], fakeFs({ [exe]: "", [cliJs]: "" }))).toEqual({ exe, cliJs });
  });

  it("works for forks whose launcher has another name", () => {
    const cursor = "C:\\Users\\me\\AppData\\Local\\Programs\\cursor";
    const cursorExe = path.join(cursor, "Cursor.exe");
    const cliJs = path.join(cursor, "abc123", "resources", "app", "out", "cli.js");
    const cmd = CODE_CMD.replace("Code.exe", "Cursor.exe").replace("2a59476c9b", "abc123");
    const fs = fakeFs({ [cursorExe]: "", [path.join(cursor, "bin", "cursor.cmd")]: cmd, [cliJs]: "" });
    expect(resolveCodeCli([cursorExe], fs)).toEqual({ exe: cursorExe, cliJs });
  });

  it("tries the next candidate when one is not installed", () => {
    const cliJs = path.join(install, "resources", "app", "out", "cli.js");
    expect(resolveCodeCli(["C:\\nope\\Code.exe", exe], fakeFs({ [exe]: "", [cliJs]: "" }))).toEqual({ exe, cliJs });
  });

  it("returns null when no candidate has a CLI", () => {
    expect(resolveCodeCli([exe], fakeFs({ [exe]: "" }))).toBeNull();
  });
});

describe("openLocationCommand", () => {
  const cli = { exe, cliJs: path.join(install, "resources", "app", "out", "cli.js") };

  it("runs the CLI script through Code.exe as Node, reusing the window", () => {
    const command = openLocationCommand(cli, "C:\\repos\\my app\\main.py", 42, 5, { PATH: "x", VSCODE_DEV: "1" });
    expect(command.command).toBe(exe);
    expect(command.args).toEqual([cli.cliJs, "--reuse-window", "--goto", "C:\\repos\\my app\\main.py:42:5"]);
    expect(command.env).toEqual({ PATH: "x", ELECTRON_RUN_AS_NODE: "1" });
  });
});

describe("openLocation", () => {
  const cli = { exe, cliJs: "cli.js" };

  it("resolves when the CLI exits cleanly", async () => {
    const calls: string[][] = [];
    await openLocation(cli, "C:\\a.py", 1, 1, async (command, args) => {
      calls.push([command, ...args]);
    });
    expect(calls).toHaveLength(1);
  });

  it("reports CLI failures", async () => {
    await expect(
      openLocation(cli, "C:\\a.py", 1, 1, async () => {
        throw new Error("exit code 1");
      }),
    ).rejects.toThrow(/VS Code CLI failed: exit code 1/);
  });
});
