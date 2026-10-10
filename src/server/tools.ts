import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Coordinator, ToolError } from "./coordinator.js";

const VERSION = "0.1.0";

const targetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("rect"),
      x: z.number(),
      y: z.number(),
      w: z.number().positive(),
      h: z.number().positive(),
    })
    .describe("A rectangle in physical screen pixels (top-left of the primary display is 0,0)."),
  z.object({ kind: z.literal("none") }).describe("No highlight; the bubble is shown as a centred card."),
]);

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

async function run(work: () => Promise<unknown>) {
  try {
    return ok(await work());
  } catch (error) {
    if (error instanceof ToolError) {
      return { content: [{ type: "text" as const, text: `${error.code}: ${error.message}` }], isError: true };
    }
    throw error;
  }
}

/** The Easy Instruct MCP server: tools an agent uses to teach the user step by step on screen. */
export function createServer(coordinator: Coordinator): McpServer {
  const server = new McpServer({ name: "easy-instruct", version: VERSION });

  server.registerTool(
    "start_session",
    {
      title: "Start a guided lesson",
      description:
        "Opens a full-screen overlay that dims the screen and shows an intro card with Start/Exit. " +
        "Plan the whole lesson before calling this. Then call wait_for_user; the user pressing Start returns event 'next'. " +
        "The user performs every action themselves: never click, type or run commands for them during a lesson.",
      inputSchema: {
        title: z.string().min(1).max(120).describe("Lesson title, e.g. 'Tour of this FastAPI repo'."),
        intro: z.string().min(1).max(2000).describe("Markdown: what the lesson covers and roughly how long it takes."),
      },
    },
    ({ title, intro }) => run(async () => ({ session_id: (await coordinator.startSession({ title, intro })).sessionId })),
  );

  server.registerTool(
    "show_step",
    {
      title: "Show a lesson step",
      description:
        "Highlights up to 3 screen areas and shows an explanation bubble next to them. Returns immediately with which " +
        "targets were drawn (resolved) and which were not on screen (unresolved); then call wait_for_user. " +
        "mode 'read': the user reads and presses Next. 'click': tell the user what to click inside the highlight; they press Skip when done. " +
        "'do': tell the user exactly what to do (e.g. a command in a code block, then press Enter); they press Done when finished. " +
        "Keep the body short (under ~80 words) and say why the thing matters, not only what it is.",
      inputSchema: {
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(4000).describe("Markdown: **bold**, *italic*, `code`, fenced code blocks and lists."),
        targets: z.array(targetSchema).max(3).describe("Areas to highlight; empty shows a centred card."),
        mode: z.enum(["read", "click", "do"]),
        step_label: z.string().max(20).optional().describe("Progress label such as '3/9'."),
      },
    },
    ({ title, body, targets, mode, step_label }) =>
      run(async () => {
        const result = await coordinator.showStep({ title, body, targets, mode, label: step_label });
        return { step_id: result.stepId, resolved: result.resolved, unresolved: result.unresolved };
      }),
  );

  server.registerTool(
    "show_card",
    {
      title: "Show a card",
      description: "Shows a centred card with no highlight, e.g. an overview or a transition between parts. Then call wait_for_user.",
      inputSchema: {
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(4000),
        step_label: z.string().max(20).optional(),
      },
    },
    ({ title, body, step_label }) =>
      run(async () => ({ step_id: (await coordinator.showCard({ title, body, label: step_label })).stepId })),
  );

  server.registerTool(
    "wait_for_user",
    {
      title: "Wait for the user",
      description:
        "Blocks until the user finishes the newest step, asks a question or exits. Back/forward through earlier steps is " +
        "handled by the overlay and does not return. Events: next | done | skip (step finished), ask (with question: answer " +
        "it with one to three extra steps, then continue), exit (lesson over; reason 'user' or 'overlay_crashed'), " +
        "timeout (nothing happened; the step stays on screen, call again).",
      inputSchema: {
        timeout_sec: z.number().positive().max(3600).default(600),
      },
    },
    ({ timeout_sec }, extra) => run(() => coordinator.waitForUser({ timeoutSec: timeout_sec, signal: extra.signal })),
  );

  server.registerTool(
    "end_session",
    {
      title: "End the lesson",
      description:
        "Shows a summary card (what was learned, what to read next); the overlay closes when the user dismisses it.",
      inputSchema: {
        summary: z.string().min(1).max(4000).describe("Markdown summary."),
        title: z.string().min(1).max(120).optional(),
      },
    },
    ({ summary, title }) => run(() => coordinator.endSession({ summary, title })),
  );

  return server;
}
