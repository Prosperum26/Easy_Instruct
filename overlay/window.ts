import { BrowserWindow, globalShortcut, ipcMain, screen } from "electron";
import path from "node:path";
import type { DisplayInfo, OverlayToServer, ServerToOverlay } from "../src/shared/protocol.js";

const DEBUG = process.env.EASY_INSTRUCT_DEBUG === "1";

export function debug(...args: unknown[]) {
  if (DEBUG) process.stderr.write(`[overlay] ${args.join(" ")}\n`);
}

function primaryDisplayInfo(): DisplayInfo {
  const display = screen.getPrimaryDisplay();
  const physical = screen.dipToScreenRect(null, display.bounds);
  return {
    scaleFactor: display.scaleFactor,
    boundsPhysical: { x: physical.x, y: physical.y, w: physical.width, h: physical.height },
  };
}

export interface Overlay {
  window: BrowserWindow;
  display(): DisplayInfo;
  /** Forwards a server message to the renderer (render, status, visibility). */
  show(message: ServerToOverlay): void;
  /** The step currently drawn, if any. */
  currentStepId(): string | null;
  onEvent(listener: (message: OverlayToServer) => void): void;
  onReady(listener: () => void): void;
  onDisplayChanged(listener: (display: DisplayInfo) => void): void;
  onQuitShortcut(listener: () => void): void;
}

/**
 * The transparent, always-on-top, non-focusable window covering the primary display.
 * It ignores the mouse except over the bubble, and only takes keyboard focus while
 * the user types a question.
 */
export function createOverlay(): Overlay {
  const window = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds,
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

  let display = primaryDisplayInfo();
  let lastRender: Extract<ServerToOverlay, { type: "render" }> | null = null;
  const eventListeners: Array<(message: OverlayToServer) => void> = [];
  const displayListeners: Array<(display: DisplayInfo) => void> = [];
  const quitListeners: Array<() => void> = [];

  const send = (message: ServerToOverlay) => window.webContents.send("overlay:message", message, display);

  // Windows shrinks new windows to the work area; re-apply so the taskbar is covered too.
  const fitToDisplay = () => window.setBounds(screen.getPrimaryDisplay().bounds);

  const handleDisplayChange = () => {
    display = primaryDisplayInfo();
    fitToDisplay();
    debug("display changed", JSON.stringify(display));
    if (lastRender) send(lastRender);
    displayListeners.forEach((listener) => listener(display));
  };
  screen.on("display-metrics-changed", handleDisplayChange);
  screen.on("display-added", handleDisplayChange);
  screen.on("display-removed", handleDisplayChange);
  window.on("closed", () => {
    screen.off("display-metrics-changed", handleDisplayChange);
    screen.off("display-added", handleDisplayChange);
    screen.off("display-removed", handleDisplayChange);
  });

  ipcMain.on("overlay:interactive", (_event, interactive: boolean) => {
    window.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.on("overlay:focusable", (_event, focusable: boolean) => {
    window.setFocusable(focusable);
    if (focusable) {
      window.setIgnoreMouseEvents(false);
      window.focus();
    } else {
      window.blur();
    }
  });
  ipcMain.on("overlay:event", (_event, message: OverlayToServer) => {
    eventListeners.forEach((listener) => listener(message));
  });

  window.webContents.on("console-message", (event) => debug("renderer:", event.level, event.message));
  window.webContents.on("did-fail-load", (_event, code, description) => debug("load failed:", code, description));
  window.webContents.on("render-process-gone", (_event, details) => debug("renderer gone:", details.reason));

  globalShortcut.register("Control+Alt+H", () => {
    if (window.isVisible()) {
      window.hide();
    } else {
      window.showInactive();
      window.setAlwaysOnTop(true, "screen-saver");
    }
  });
  globalShortcut.register("Control+Alt+Q", () => quitListeners.forEach((listener) => listener()));

  return {
    window,
    display: () => display,
    show(message) {
      if (message.type === "render") lastRender = message;
      send(message);
    },
    currentStepId: () => lastRender?.stepId ?? null,
    onEvent: (listener) => eventListeners.push(listener),
    onReady(listener) {
      ipcMain.once("overlay:ready", () => {
        window.showInactive();
        fitToDisplay();
        debug("renderer ready", JSON.stringify(display));
        listener();
      });
      window.loadFile(path.join(__dirname, "renderer", "index.html"));
    },
    onDisplayChanged: (listener) => displayListeners.push(listener),
    onQuitShortcut: (listener) => quitListeners.push(listener),
  };
}
