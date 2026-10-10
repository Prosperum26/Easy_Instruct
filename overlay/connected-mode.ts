import { app } from "electron";
import type { OverlayToServer, ServerToOverlay } from "../src/shared/protocol.js";
import { debug, type Overlay } from "./window.js";

const QUIT_FALLBACK_MS = 1500;

/**
 * Connects back to the MCP server and relays messages both ways. The overlay never
 * outlives its server: when the socket closes, the app quits.
 */
export function runConnected(overlay: Overlay, { port, token }: { port: number; token: string }) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const send = (message: OverlayToServer) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  let rendererReady = false;
  let socketOpen = false;
  const sayHello = () => {
    if (rendererReady && socketOpen) send({ type: "hello", token, display: overlay.display() });
  };

  overlay.onReady(() => {
    rendererReady = true;
    sayHello();
  });

  socket.addEventListener("open", () => {
    socketOpen = true;
    sayHello();
  });
  socket.addEventListener("message", (event) => {
    let message: ServerToOverlay;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.type === "close") app.quit();
    else overlay.show(message);
  });
  socket.addEventListener("close", () => {
    debug("server connection closed");
    app.quit();
  });
  socket.addEventListener("error", () => debug("server connection error"));

  overlay.onEvent(send);
  overlay.onDisplayChanged((display) => send({ type: "display", display }));
  overlay.onQuitShortcut(() => {
    const stepId = overlay.currentStepId();
    if (stepId) send({ type: "button", stepId, button: "exit" });
    // The server answers with close; quit anyway if it does not.
    setTimeout(() => app.quit(), QUIT_FALLBACK_MS);
  });
}
