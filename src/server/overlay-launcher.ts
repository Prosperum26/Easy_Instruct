import { spawn, type ChildProcess } from "node:child_process";
import { OverlayChannel, type OverlayConnection } from "./overlay-channel.js";

export interface LaunchOptions {
  /** The Electron executable (or any runtime that can run `mainPath`). */
  electronPath: string;
  /** The overlay entry point passed as the first argument. */
  mainPath: string;
  connectTimeoutMs?: number;
  /** How long `stop()` waits for a graceful exit before killing the process. */
  stopGraceMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface LaunchedOverlay {
  connection: OverlayConnection;
  process: ChildProcess;
  /** Called once when the overlay process ends, whether stopped or crashed. */
  onExit(listener: (code: number | null) => void): void;
  stop(): Promise<void>;
}

const DEBUG = process.env.EASY_INSTRUCT_DEBUG === "1";

/**
 * Starts the overlay process and waits until it connects back. The child's stdout is
 * discarded because the MCP protocol owns this process's stdout.
 */
export async function launchOverlay({
  electronPath,
  mainPath,
  connectTimeoutMs = 15_000,
  stopGraceMs = 2_000,
  env = process.env,
}: LaunchOptions): Promise<LaunchedOverlay> {
  const channel = await OverlayChannel.listen();
  // Agents running inside VS Code (its extension host) pass ELECTRON_RUN_AS_NODE=1 down to MCP
  // servers; Electron would then start as plain Node and the overlay could not open.
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...childEnv } = env;
  const child = spawn(electronPath, [mainPath, `--port=${channel.port}`, `--token=${channel.token}`], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
    env: childEnv,
  });
  child.stderr?.on("data", (chunk) => {
    if (DEBUG) process.stderr.write(chunk);
  });

  const failedEarly = new Promise<never>((_, reject) => {
    child.once("error", (error) => reject(new Error(`Could not start the overlay: ${error.message}`)));
    child.once("exit", (code) => reject(new Error(`The overlay exited before connecting (code ${code}).`)));
  });
  failedEarly.catch(() => {});

  let connection: OverlayConnection;
  try {
    connection = await Promise.race([channel.waitForConnection(connectTimeoutMs), failedEarly]);
  } catch (error) {
    child.kill();
    await channel.close();
    throw error;
  }

  let exitCode: number | null | undefined;
  const exitListeners: Array<(code: number | null) => void> = [];
  const exited = new Promise<void>((resolve) =>
    child.once("exit", (code) => {
      exitCode = code;
      exitListeners.forEach((listener) => listener(code));
      resolve();
    }),
  );

  // Never leave an orphaned overlay on screen if this server process ends.
  const killOnServerExit = () => child.kill();
  process.once("exit", killOnServerExit);

  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      process.off("exit", killOnServerExit);
      if (exitCode === undefined) {
        connection.send({ type: "close" });
        const graceful = await Promise.race([
          exited.then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), stopGraceMs)),
        ]);
        if (!graceful) {
          child.kill();
          await exited;
        }
      }
      await channel.close();
    })());

  return {
    connection,
    process: child,
    onExit(listener) {
      if (exitCode !== undefined) listener(exitCode);
      else exitListeners.push(listener);
    },
    stop,
  };
}
