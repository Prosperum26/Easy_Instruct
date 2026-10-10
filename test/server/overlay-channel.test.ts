import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { OverlayChannel, OverlayTimeoutError } from "../../src/server/overlay-channel.js";
import type { DisplayInfo, OverlayToServer } from "../../src/shared/protocol.js";

const display: DisplayInfo = { scaleFactor: 1.25, boundsPhysical: { x: 0, y: 0, w: 1920, h: 1080 } };

function connect(channel: OverlayChannel): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${channel.port}`);
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

const closed = (socket: WebSocket) => new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
const nextMessage = (socket: WebSocket) =>
  new Promise<unknown>((resolve) => socket.once("message", (data) => resolve(JSON.parse(String(data)))));

describe("OverlayChannel", () => {
  let channel: OverlayChannel;
  const sockets: WebSocket[] = [];
  const open = async () => {
    const socket = await connect(channel);
    sockets.push(socket);
    return socket;
  };

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.terminate());
    await channel?.close();
  });

  it("listens on localhost with a random token", async () => {
    channel = await OverlayChannel.listen();
    expect(channel.port).toBeGreaterThan(0);
    expect(channel.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts an overlay that says hello with the right token", async () => {
    channel = await OverlayChannel.listen();
    const pending = channel.waitForConnection(2000);
    const socket = await open();
    socket.send(JSON.stringify({ type: "hello", token: channel.token, display }));
    const connection = await pending;
    expect(connection.display).toEqual(display);
  });

  it("closes sockets with a wrong token and keeps waiting", async () => {
    channel = await OverlayChannel.listen();
    const pending = channel.waitForConnection(2000);
    const intruder = await open();
    intruder.send(JSON.stringify({ type: "hello", token: "nope", display }));
    expect(await closed(intruder)).toBe(1008);

    const socket = await open();
    socket.send(JSON.stringify({ type: "hello", token: channel.token, display }));
    await expect(pending).resolves.toBeDefined();
  });

  it("closes sockets whose first message is not a hello", async () => {
    channel = await OverlayChannel.listen();
    channel.waitForConnection(2000).catch(() => {});
    const socket = await open();
    socket.send(JSON.stringify({ type: "button", stepId: "s1", button: "next" }));
    expect(await closed(socket)).toBe(1008);
  });

  it("closes sockets that send invalid JSON", async () => {
    channel = await OverlayChannel.listen();
    channel.waitForConnection(2000).catch(() => {});
    const socket = await open();
    socket.send("{not json");
    expect(await closed(socket)).toBe(1008);
  });

  it("rejects when no overlay connects in time", async () => {
    channel = await OverlayChannel.listen();
    await expect(channel.waitForConnection(50)).rejects.toBeInstanceOf(OverlayTimeoutError);
  });

  describe("an open connection", () => {
    const setup = async () => {
      channel = await OverlayChannel.listen();
      const pending = channel.waitForConnection(2000);
      const socket = await open();
      socket.send(JSON.stringify({ type: "hello", token: channel.token, display }));
      return { socket, connection: await pending };
    };

    it("delivers server messages to the overlay", async () => {
      const { socket, connection } = await setup();
      const received = nextMessage(socket);
      connection.send({ type: "status", text: "hi" });
      expect(await received).toEqual({ type: "status", text: "hi" });
    });

    it("delivers valid overlay messages and drops malformed ones", async () => {
      const { socket, connection } = await setup();
      const messages: OverlayToServer[] = [];
      const got = new Promise<void>((resolve) =>
        connection.onMessage((m) => {
          messages.push(m);
          if (m.type === "ask") resolve();
        }),
      );
      socket.send(JSON.stringify({ type: "button", stepId: "s1", button: "teleport" }));
      socket.send("garbage");
      socket.send(JSON.stringify({ type: "button", stepId: "s1", button: "next" }));
      socket.send(JSON.stringify({ type: "ask", stepId: "s1", question: "?" }));
      await got;
      expect(messages).toEqual([
        { type: "button", stepId: "s1", button: "next" },
        { type: "ask", stepId: "s1", question: "?" },
      ]);
    });

    it("updates the display when the overlay reports a change", async () => {
      const { socket, connection } = await setup();
      const changed = { scaleFactor: 1.5, boundsPhysical: { x: 0, y: 0, w: 2560, h: 1440 } };
      const got = new Promise<void>((resolve) => connection.onMessage(() => resolve()));
      socket.send(JSON.stringify({ type: "display", display: changed }));
      await got;
      expect(connection.display).toEqual(changed);
    });

    it("refuses a second overlay while one is connected", async () => {
      await setup();
      const second = await open();
      second.send(JSON.stringify({ type: "hello", token: channel.token, display }));
      expect(await closed(second)).toBe(1008);
    });

    it("reports when the overlay disconnects", async () => {
      const { socket, connection } = await setup();
      const gone = new Promise<void>((resolve) => connection.onClose(resolve));
      socket.close();
      await expect(gone).resolves.toBeUndefined();
    });

    it("ignores sends after the overlay is gone", async () => {
      const { socket, connection } = await setup();
      const gone = new Promise<void>((resolve) => connection.onClose(resolve));
      socket.terminate();
      await gone;
      expect(() => connection.send({ type: "close" })).not.toThrow();
    });
  });
});
