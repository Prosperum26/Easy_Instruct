import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Coordinator } from "../../src/server/coordinator.js";
import { createServer } from "../../src/server/tools.js";
import { FakeOverlayHandle } from "../helpers/fake-overlay-handle.js";

type CallResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };

describe("MCP tools", () => {
  let client: Client;
  let overlay: FakeOverlayHandle;

  beforeEach(async () => {
    const coordinator = new Coordinator({
      launch: async () => (overlay = new FakeOverlayHandle()),
    });
    const server = createServer(coordinator);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-agent", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });
  afterEach(() => client.close());

  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as CallResult;
  const json = (result: CallResult) => JSON.parse(result.content[0].text!);

  it("lists the M2 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["end_session", "show_card", "show_step", "start_session", "wait_for_user"]);
  });

  it("runs a short lesson end to end", async () => {
    expect(json(await call("start_session", { title: "Repo tour", intro: "Xin chào" }))).toHaveProperty("session_id");

    const waitingStart = call("wait_for_user", { timeout_sec: 5 });
    overlay.press("start");
    expect(json(await waitingStart)).toEqual({ event: "next", step_id: "s1" });

    const shown = json(
      await call("show_step", {
        title: "Explorer",
        body: "Cây thư mục",
        targets: [{ kind: "rect", x: 0, y: 40, w: 300, h: 900 }],
        mode: "read",
        step_label: "1/3",
      }),
    );
    expect(shown).toEqual({
      step_id: "s2",
      resolved: [{ rect: { x: 0, y: 40, w: 300, h: 900 }, method: "explicit", confidence: 1 }],
      unresolved: [],
    });

    const waitingNext = call("wait_for_user", { timeout_sec: 5 });
    overlay.ask("Explorer là gì?");
    expect(json(await waitingNext)).toEqual({ event: "ask", step_id: "s2", question: "Explorer là gì?" });

    expect(json(await call("end_session", { summary: "Xong" }))).toEqual({ ok: true });
    expect(overlay.lastRender()).toMatchObject({ kind: "card", buttons: ["close"] });
  });

  it("returns a tool error with a code when there is no session", async () => {
    const result = await call("show_step", { title: "A", body: "b", targets: [], mode: "read" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^NO_SESSION:/);
  });

  it("rejects more than three targets", async () => {
    await call("start_session", { title: "T", intro: "i" });
    const target = { kind: "rect", x: 0, y: 0, w: 10, h: 10 };
    const result = await call("show_step", { title: "A", body: "b", targets: [target, target, target, target], mode: "read" });
    expect(result.isError).toBe(true);
  });

  it("rejects rects without a positive size", async () => {
    await call("start_session", { title: "T", intro: "i" });
    const result = await call("show_step", {
      title: "A",
      body: "b",
      targets: [{ kind: "rect", x: 0, y: 0, w: 0, h: 10 }],
      mode: "read",
    });
    expect(result.isError).toBe(true);
  });

  it("rejects timeouts above one hour", async () => {
    await call("start_session", { title: "T", intro: "i" });
    expect((await call("wait_for_user", { timeout_sec: 7200 })).isError).toBe(true);
  });
});
