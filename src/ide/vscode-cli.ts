import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface CodeCli {
  /** Code.exe (or a fork's launcher), run as Node with ELECTRON_RUN_AS_NODE. */
  exe: string;
  /** The CLI script that bin\code.cmd would run. */
  cliJs: string;
}

export interface FileSystem {
  exists(p: string): boolean;
  read(p: string): string;
  list(dir: string): string[];
}

const realFs: FileSystem = {
  exists: existsSync,
  read: (p) => readFileSync(p, "utf8"),
  list: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
};

/** Where VS Code is usually installed, after the executable of the window being taught. */
export function codeExeCandidates(fromWindow?: string): string[] {
  const local = process.env.LOCALAPPDATA ?? "";
  const programs = process.env.ProgramFiles ?? "C:\\Program Files";
  return [
    ...(fromWindow ? [fromWindow] : []),
    path.join(local, "Programs", "Microsoft VS Code", "Code.exe"),
    path.join(programs, "Microsoft VS Code", "Code.exe"),
  ];
}

/**
 * Finds the CLI script next to a VS Code executable. Newer builds keep it in a versioned folder that
 * bin\code.cmd names ("%~dp0..\<version>\resources\app\out\cli.js"); older ones in resources\app\out.
 */
export function resolveCodeCli(candidates: string[], fs: FileSystem = realFs): CodeCli | null {
  for (const exe of candidates) {
    if (!exe || !fs.exists(exe)) continue;
    const dir = path.dirname(exe);
    const bin = path.join(dir, "bin");
    for (const file of fs.list(bin).filter((f) => f.toLowerCase().endsWith(".cmd"))) {
      const match = /"%~dp0\.\.\\([^"]*cli\.js)"/i.exec(fs.read(path.join(bin, file)));
      if (!match) continue;
      const cliJs = path.join(dir, ...match[1].split("\\"));
      if (fs.exists(cliJs)) return { exe, cliJs };
    }
    const classic = path.join(dir, "resources", "app", "out", "cli.js");
    if (fs.exists(classic)) return { exe, cliJs: classic };
  }
  return null;
}

/** The process to start, without a shell, so paths with spaces or & need no quoting. */
export function openLocationCommand(cli: CodeCli, file: string, line: number, column: number, env: NodeJS.ProcessEnv = process.env) {
  const { VSCODE_DEV: _ignored, ...rest } = env;
  return {
    command: cli.exe,
    args: [cli.cliJs, "--reuse-window", "--goto", `${file}:${line}:${column}`],
    env: { ...rest, ELECTRON_RUN_AS_NODE: "1" },
  };
}

export type Runner = (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<void>;

const runProcess: Runner = (command, args, env) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { env, windowsHide: true, timeout: 15_000 }, (error) => (error ? reject(error) : resolve()));
  });

/** Opens `file` at `line`:`column` in the existing VS Code window and reveals it. */
export async function openLocation(cli: CodeCli, file: string, line: number, column = 1, run: Runner = runProcess): Promise<void> {
  const { command, args, env } = openLocationCommand(cli, file, line, column);
  try {
    await run(command, args, env);
  } catch (error) {
    throw new Error(`VS Code CLI failed: ${(error as Error).message}`);
  }
}
