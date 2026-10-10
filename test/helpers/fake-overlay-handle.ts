import type { OverlayHandle } from "../../src/server/coordinator.js";
import type { ButtonId, DisplayInfo, OverlayToServer, RenderMessage, ServerToOverlay } from "../../src/shared/protocol.js";

/** An in-process overlay: records what the server sends and lets tests act as the user. */
export class FakeOverlayHandle implements OverlayHandle {
  sent: ServerToOverlay[] = [];
  stopped = false;
  display: DisplayInfo = { scaleFactor: 1, boundsPhysical: { x: 0, y: 0, w: 1920, h: 1080 } };
  private messageListeners: Array<(m: OverlayToServer) => void> = [];
  private exitListeners: Array<(code: number | null) => void> = [];

  connection = {
    display: () => this.display,
    send: (message: ServerToOverlay) => {
      this.sent.push(message);
    },
    onMessage: (listener: (m: OverlayToServer) => void) => {
      this.messageListeners.push(listener);
    },
  };

  onExit(listener: (code: number | null) => void) {
    this.exitListeners.push(listener);
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.exitListeners.forEach((listener) => listener(0));
  }

  lastRender(): RenderMessage {
    const render = this.sent.filter((m): m is RenderMessage => m.type === "render").at(-1);
    if (!render) throw new Error("nothing rendered yet");
    return render;
  }

  lastStatus(): string | null | undefined {
    const status = this.sent.filter((m) => m.type === "status").at(-1);
    return status?.type === "status" ? status.text : undefined;
  }

  press(button: ButtonId, stepId = this.lastRender().stepId) {
    this.emit({ type: "button", stepId, button });
  }

  ask(question: string, stepId = this.lastRender().stepId) {
    this.emit({ type: "ask", stepId, question });
  }

  crash(code = 1) {
    this.exitListeners.forEach((listener) => listener(code));
  }

  private emit(message: OverlayToServer) {
    this.messageListeners.forEach((listener) => listener(message));
  }
}
