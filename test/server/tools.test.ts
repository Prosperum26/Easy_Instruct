import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guideDir } from "../../src/server/guide.js";
import { Coordinator } from "../../src/server/coordinator.js";
import { createServer } from "../../src/server/tools.js";
import { explorerAndTerminal } from "../fixtures/uia/vscode-layout.js";
import { FakeHelper } from "../helpers/fake-helper.js";
import { FakeOverlayHandle } from "../helpers/fake-overlay-handle.js";

type CallResult = { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean };

describe("MCP tools", () => {
  let client: Client;
  let overlay: FakeOverlayHandle;

  beforeEach(async () => {
    const coordinator = new Coordinator({
      launch: async () => (overlay = new FakeOverlayHandle()),
      helper: Object.assign(new FakeHelper(), { snapshot: explorerAndTerminal() }),
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

  it("lists the tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["end_session", "observe", "open_location", "show_card", "show_step", "start_session", "wait_for_user"]);
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


  it("returns the screenshot as an image plus its metadata", async () => {
    const result = await call("observe", {});
    expect(result.content[0]).toEqual({ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" });
    expect(JSON.parse(result.content[1].text!)).toMatchObject({ screenshot_id: "shot-1", source: "ide", scale: 1600 / 1920 });
  });

  it("reports the VS Code window found for the workspace", async () => {
    const started = json(await call("start_session", { title: "T", intro: "i", workspace: "C:/repos/fastapi-demo" }));
    expect(started.ide_window).toMatchObject({ title: "main.py - fastapi-demo - Visual Studio Code" });
  });

  it("accepts rects in screenshot pixels", async () => {
    await call("start_session", { title: "T", intro: "i" });
    await call("observe", {});
    const shown = json(
      await call("show_step", {
        title: "A",
        body: "b",
        mode: "read",
        targets: [{ kind: "rect", x: 100, y: 50, w: 250, h: 25, space: "screenshot", screenshot_id: "shot-1" }],
      }),
    );
    expect(shown.resolved[0].rect).toEqual({ x: 120, y: 60, w: 300, h: 30 });
  });

  it("requires a screenshot id for screenshot-space rects", async () => {
    await call("start_session", { title: "T", intro: "i" });
    const result = await call("show_step", {
      title: "A",
      body: "b",
      mode: "read",
      targets: [{ kind: "rect", x: 1, y: 1, w: 5, h: 5, space: "screenshot" }],
    });
    expect(result.isError).toBe(true);
  });


  it("highlights VS Code parts, text and lines by description", async () => {
    await call("start_session", { title: "T", intro: "i" });
    const shown = json(
      await call("show_step", {
        title: "A",
        body: "b",
        mode: "read",
        targets: [
          { kind: "ui", element: "explorer" },
          { kind: "text", text: "README.md", within: "tabs", occurrence: 1 },
        ],
      }),
    );
    expect(shown.resolved.map((r: { method: string }) => r.method)).toEqual(["uia", "uia"]);
    expect(shown.resolved[0]).toMatchObject({ detail: "view" });
  });

  it("returns a preview image when asked to verify", async () => {
    await call("start_session", { title: "T", intro: "i" });
    const result = await call("show_step", {
      title: "A",
      body: "b",
      mode: "read",
      verify: true,
      targets: [{ kind: "ui", element: "editor" }],
    });
    expect(JSON.parse(result.content[0].text!)).toHaveProperty("preview");
    expect(result.content[1]).toMatchObject({ type: "image", mimeType: "image/png" });
  });

  it("rejects line ranges that end before they start", async () => {
    await call("start_session", { title: "T", intro: "i" });
    const result = await call("show_step", {
      title: "A",
      body: "b",
      mode: "read",
      targets: [{ kind: "lines", file: "app.py", start: 10, end: 5 }],
    });
    expect(result.isError).toBe(true);
  });

  it("rejects unknown VS Code parts", async () => {
    await call("start_session", { title: "T", intro: "i" });
    const result = await call("show_step", { title: "A", body: "b", mode: "read", targets: [{ kind: "ui", element: "minimap" }] });
    expect(result.isError).toBe(true);
  });

  it("reports open_location problems with a code", async () => {
    const result = await call("open_location", { file: "C:/definitely/not/here.py", line: 3 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^FILE_NOT_FOUND:/);
  });


  describe("guidance for agents", () => {
    it("sends short instructions that point at the guide", () => {
      const instructions = client.getInstructions() ?? "";
      expect(instructions).toContain("easy-instruct://guide/SKILL.md");
      expect(instructions).toMatch(/user does every action/i);
      expect(instructions.length).toBeLessThan(2500);
    });

    it("serves every guide file as a Markdown resource", async () => {
      const { resources } = await client.listResources();
      const uris = resources.map((r) => r.uri);
      expect(uris).toContain("easy-instruct://guide/SKILL.md");
      expect(uris).toContain("easy-instruct://guide/references/recovery.md");
      expect(uris).toContain("easy-instruct://guide/references/flows/explore-repo.md");
      expect(resources.every((r) => r.mimeType === "text/markdown")).toBe(true);

      const { contents } = await client.readResource({ uri: "easy-instruct://guide/references/targets.md" });
      expect(contents[0]).toMatchObject({ mimeType: "text/markdown" });
      expect((contents[0] as { text: string }).text).toBe(readFileSync(path.join(guideDir(), "references", "targets.md"), "utf8"));
    });

    it("offers prompts that carry the workflow and the matching flow", async () => {
      const { prompts } = await client.listPrompts();
      expect(prompts.map((p) => p.name).sort()).toEqual(["explain_file", "explore_repo", "run_project"]);

      const workspace = String.raw`C:\repos\todo-api`;
      const tour = await client.getPrompt({ name: "explore_repo", arguments: { workspace } });
      const text = (tour.messages[0].content as { text: string }).text;
      expect(text).toContain(workspace);
      expect(text).toContain("# Flow: exploring a freshly cloned repository");
      expect(text).toContain("## The golden rules");
      expect(text).not.toMatch(/^name: easy-instruct$/m);

      const explain = await client.getPrompt({ name: "explain_file", arguments: { file: "app/main.py", question: "why?" } });
      expect((explain.messages[0].content as { text: string }).text).toContain("app/main.py");
    });

    it("names every tool in the skill", async () => {
      const skill = readFileSync(path.join(guideDir(), "SKILL.md"), "utf8");
      const { tools } = await client.listTools();
      for (const tool of tools) expect(skill, tool.name).toContain("`" + tool.name + "`");
    });
  });
});
