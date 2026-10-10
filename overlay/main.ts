import { app, BrowserWindow, globalShortcut, ipcMain, screen } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { DisplayInfo, OverlayToServer, RenderMessage, ServerToOverlay } from "../src/shared/protocol.js";
import { buildDemoSteps, buildRectCheckStep, parseRectArg, parseStepArg } from "./demo.js";

const ADVANCE = new Set(["next", "done", "skip", "start"]);

if (!app.requestSingleInstanceLock()) app.quit();

const DEBUG = process.env.EASY_INSTRUCT_DEBUG === "1";

function log(event: object) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function debug(...args: unknown[]) {
  if (DEBUG) process.stderr.write(`[overlay] ${args.join(" ")}\n`);
}

/** `--capture=<file.png>`: saves what the overlay renders for the first step, then quits. */
function parseCaptureArg(argv: string[]): string | null {
  return argv.find((a) => a.startsWith("--capture="))?.slice("--capture=".length) ?? null;
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const window = new BrowserWindow({
    ...display.bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.setAlwaysOnTop(true, "screen-saver");
  window.setIgnoreMouseEvents(true, { forward: true });

  const physical = screen.dipToScreenRect(null, display.bounds);
  const info: DisplayInfo = {
    scaleFactor: display.scaleFactor,
    boundsPhysical: { x: physical.x, y: physical.y, w: physical.width, h: physical.height },
  };
  return { window, info, physical };
}

app.whenReady().then(() => {
  const { window, info, physical } = createOverlayWindow();
  const send = (message: ServerToOverlay) => window.webContents.send("overlay:message", message, info);

  const rect = parseRectArg(process.argv);
  const steps: RenderMessage[] = rect
    ? [buildRectCheckStep(rect)]
    : buildDemoSteps({ x: physical.x, y: physical.y, w: physical.width, h: physical.height });
  let index = parseStepArg(process.argv, steps.length);

  ipcMain.on("overlay:interactive", (_event, interactive: boolean) => {
    window.setIgnoreMouseEvents(!interactive, { forward: true });
  });

  window.webContents.on("console-message", (event) => debug("renderer:", event.level, event.message));
  window.webContents.on("did-fail-load", (_event, code, description) => debug("load failed:", code, description));
  window.webContents.on("render-process-gone", (_event, details) => debug("renderer gone:", details.reason));

  const capturePath = parseCaptureArg(process.argv);

  ipcMain.once("overlay:ready", () => {
    debug("renderer ready, scaleFactor", info.scaleFactor);
    window.showInactive();
    // Windows shrinks new windows to the work area; re-apply so the taskbar is covered too.
    window.setBounds(screen.getPrimaryDisplay().bounds);
    debug("window bounds", JSON.stringify(window.getBounds()), "display", JSON.stringify(screen.getPrimaryDisplay().bounds));
    send(steps[index]);
    if (capturePath) {
      setTimeout(async () => {
        const image = await window.webContents.capturePage();
        await writeFile(capturePath, image.toPNG());
        debug("captured", capturePath);
        app.quit();
      }, 800);
    }
  });

  ipcMain.on("overlay:event", (_event, message: OverlayToServer) => {
    log(message);
    if (message.type !== "button") return;
    if (ADVANCE.has(message.button)) index++;
    else if (message.button === "back") index = Math.max(0, index - 1);
    else if (message.button === "exit" || message.button === "close") index = steps.length;
    else return;

    if (index >= steps.length) app.quit();
    else send(steps[index]);
  });

  globalShortcut.register("Control+Alt+H", () => {
    if (window.isVisible()) {
      window.hide();
    } else {
      window.showInactive();
      window.setAlwaysOnTop(true, "screen-saver");
    }
  });
  globalShortcut.register("Control+Alt+Q", () => {
    log({ type: "button", stepId: steps[index]?.stepId, button: "exit" });
    app.quit();
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
});

app.on("will-quit", () => globalShortcut.unregisterAll());
