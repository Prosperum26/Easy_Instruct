import { randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import type { DisplayInfo, OverlayToServer, ServerToOverlay } from "../shared/protocol.js";

const POLICY_VIOLATION = 1008;
const HELLO_TIMEOUT_MS = 5000;

const rectSchema = z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() });
const displaySchema = z.object({ scaleFactor: z.number().positive(), boundsPhysical: rectSchema });
const buttonSchema = z.enum(["back", "ask", "next", "done", "skip", "start", "exit", "close"]);

const helloSchema = z.object({ type: z.literal("hello"), token: z.string(), display: displaySchema });
const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("display"), display: displaySchema }),
  z.object({ type: z.literal("button"), stepId: z.string(), button: buttonSchema }),
  z.object({ type: z.literal("ask"), stepId: z.string(), question: z.string().max(2000) }),
  z.object({ type: z.literal("focus_released") }),
]);

export class OverlayTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The overlay did not connect within ${timeoutMs} ms.`);
  }
}

function parseJson(data: RawData): unknown {
  try {
    return JSON.parse(String(data));
  } catch {
    return undefined;
  }
}

/** The live link to one overlay process. */
export class OverlayConnection {
  private messageListeners: Array<(message: OverlayToServer) => void> = [];
  private closeListeners: Array<() => void> = [];

  constructor(
    private readonly socket: WebSocket,
    public display: DisplayInfo,
  ) {
    socket.on("message", (data) => {
      const parsed = messageSchema.safeParse(parseJson(data));
      if (!parsed.success) return;
      if (parsed.data.type === "display") this.display = parsed.data.display;
      this.messageListeners.forEach((listener) => listener(parsed.data));
    });
    socket.once("close", () => this.closeListeners.forEach((listener) => listener()));
  }

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(message: ServerToOverlay) {
    if (this.isOpen) this.socket.send(JSON.stringify(message));
  }

  onMessage(listener: (message: OverlayToServer) => void) {
    this.messageListeners.push(listener);
  }

  onClose(listener: () => void) {
    this.closeListeners.push(listener);
  }

  close() {
    this.socket.close(1000);
  }
}

/**
 * A localhost WebSocket server the overlay connects back to. Only a socket whose first
 * message is a hello with the secret token is accepted, and only one at a time.
 */
export class OverlayChannel {
  private active: OverlayConnection | null = null;
  private waiting: { resolve: (c: OverlayConnection) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  private constructor(
    private readonly server: WebSocketServer,
    readonly port: number,
    readonly token: string,
  ) {
    server.on("connection", (socket) => this.handshake(socket));
  }

  static async listen(): Promise<OverlayChannel> {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    return new OverlayChannel(server, port, randomBytes(32).toString("hex"));
  }

  waitForConnection(timeoutMs: number): Promise<OverlayConnection> {
    if (this.waiting) return Promise.reject(new Error("Already waiting for an overlay to connect."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new OverlayTimeoutError(timeoutMs));
      }, timeoutMs);
      this.waiting = { resolve, timer };
    });
  }

  async close() {
    if (this.waiting) clearTimeout(this.waiting.timer);
    this.server.clients.forEach((socket) => socket.terminate());
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private handshake(socket: WebSocket) {
    const reject = () => socket.close(POLICY_VIOLATION);
    const timer = setTimeout(reject, HELLO_TIMEOUT_MS);

    socket.once("message", (data) => {
      clearTimeout(timer);
      const hello = helloSchema.safeParse(parseJson(data));
      if (!hello.success || !this.tokenMatches(hello.data.token) || this.active || !this.waiting) return reject();

      const connection = new OverlayConnection(socket, hello.data.display);
      this.active = connection;
      connection.onClose(() => {
        if (this.active === connection) this.active = null;
      });

      const { resolve, timer: waitTimer } = this.waiting;
      clearTimeout(waitTimer);
      this.waiting = null;
      resolve(connection);
    });
  }

  private tokenMatches(candidate: string): boolean {
    const expected = Buffer.from(this.token);
    const given = Buffer.from(candidate);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
