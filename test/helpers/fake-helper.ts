import { HelperError } from "../../src/helper-client/helper-client.js";
import type { Helper } from "../../src/server/coordinator.js";
import type { WindowInfo } from "../../src/ide/windows.js";

/** An in-process win-helper answering the commands the coordinator uses. */
export class FakeHelper implements Helper {
  calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
  unavailable = false;
  display = { x: 0, y: 0, w: 1920, h: 1080 };
  windows: WindowInfo[] = [
    {
      hwnd: 42,
      title: "main.py - fastapi-demo - Visual Studio Code",
      process: "Code",
      bounds: { x: 0, y: 0, w: 1920, h: 1020 },
      minimized: false,
      foreground: false,
    },
  ];

  async request<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    this.calls.push({ cmd, args });
    if (this.unavailable) throw new HelperError("HELPER_UNAVAILABLE", "helper is down");
    return this.answer(cmd, args ?? {}) as T;
  }

  callsTo(cmd: string) {
    return this.calls.filter((c) => c.cmd === cmd);
  }

  private answer(cmd: string, args: Record<string, unknown>): unknown {
    switch (cmd) {
      case "list_windows":
        return this.windows.filter((w) => !args.process || w.process === args.process);
      case "window_bounds": {
        const window = this.windows.find((w) => w.hwnd === args.hwnd);
        if (!window) throw new HelperError("WINDOW_NOT_FOUND", "gone");
        return { bounds: window.bounds, minimized: window.minimized, foreground: false };
      }
      case "display_info":
        return { bounds: this.display };
      case "capture": {
        const w = args.w as number;
        const h = args.h as number;
        const scale = Math.min(1, ((args.maxWidth as number) ?? 1600) / w);
        return {
          png: "iVBORw0KGgo=",
          width: Math.round(w * scale),
          height: Math.round(h * scale),
          scale,
          origin: { x: args.x, y: args.y },
        };
      }
      case "focus_window":
        return { focused: true };
      default:
        throw new HelperError("UNKNOWN_COMMAND", cmd);
    }
  }
}
