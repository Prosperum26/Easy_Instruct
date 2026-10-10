import { contextBridge, ipcRenderer } from "electron";
import type { DisplayInfo, OverlayToServer, ServerToOverlay } from "../src/shared/protocol.js";

const api = {
  onMessage(callback: (message: ServerToOverlay, display: DisplayInfo) => void) {
    ipcRenderer.on("overlay:message", (_event, message: ServerToOverlay, display: DisplayInfo) =>
      callback(message, display),
    );
  },
  send(message: OverlayToServer) {
    ipcRenderer.send("overlay:event", message);
  },
  /** true while the cursor is over the bubble, so its buttons receive clicks. */
  setInteractive(interactive: boolean) {
    ipcRenderer.send("overlay:interactive", interactive);
  },
  ready() {
    ipcRenderer.send("overlay:ready");
  },
};

export type OverlayApi = typeof api;

contextBridge.exposeInMainWorld("easyInstruct", api);
