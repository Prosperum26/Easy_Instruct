import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UI_ELEMENTS, type UiElement } from "../locator/vscode-layout.js";
import { Coordinator, ToolError } from "./coordinator.js";

const VERSION = "0.1.0";

const uiElement = z.enum(UI_ELEMENTS as [UiElement, ...UiElement[]]);

const targetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("rect"),
      x: z.number(),
      y: z.number(),
      w: z.number().positive(),
      h: z.number().positive(),
      space: z
        .enum(["screen", "screenshot"])
        .default("screen")
        .describe(
          "'screen': physical screen pixels, as printed on the observe grid labels. " +
            "'screenshot': pixels of an observe image; requires screenshot_id.",
        ),
      screenshot_id: z.string().optional(),
    })
    .describe("A rectangle to highlight."),
  z.object({ kind: z.literal("none") }).describe("No highlight; the bubble is shown as a centred card."),
  z
    .object({ kind: z.literal("ui"), element: uiElement })
    .describe(
      "A VS Code part. Views (explorer, search, run_debug, source_control, extensions) give the sidebar when open " +
        "and their activity bar icon (detail: icon) when closed: then ask the user to click it.",
    ),
  z
    .object({
      kind: z.literal("text"),
      text: z.string().min(1).max(200),
      within: uiElement.optional().describe("Only look inside this part, e.g. 'terminal' or 'explorer'."),
      occurrence: z.number().int().min(1).max(50).optional().describe("1-based, in reading order."),
    })
    .describe("Visible text: a file name, a button, a line of terminal output. Accessible names first, then OCR."),
  z
    .object({
      kind: z.literal("lines"),
      file: z.string().min(1).max(1000).describe("Absolute, or relative to the lesson's workspace."),
      start: z.number().int().min(1),
      end: z.number().int().min(1).optional(),
    })
    .describe("Lines of code: the file is opened at start in VS Code, then the lines are found by their numbers."),
]);

const targetsSchema = z
  .array(targetSchema)
  .max(3)
  .refine((targets) => targets.every((t) => t.kind !== "rect" || t.space !== "screenshot" || t.screenshot_id), {
    message: "screenshot_id is required when space is 'screenshot'.",
  })
  .refine((targets) => targets.every((t) => t.kind !== "lines" || t.end === undefined || t.end >= t.start), {
    message: "end must not be before start.",
  });

const regionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

type ToolResult = {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
};

/** Runs a tool body; ToolErrors become isError results prefixed with their code. */
async function respond(work: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ToolError) {
      return { content: [{ type: "text", text: `${error.code}: ${error.message}` }], isError: true };
    }
    throw error;
  }
}

const run = (work: () => Promise<unknown>) => respond(async () => ok(await work()));

/** The Easy Instruct MCP server: tools an agent uses to teach the user step by step on screen. */
export function createServer(coordinator: Coordinator): McpServer {
  const server = new McpServer({ name: "easy-instruct", version: VERSION });

  server.registerTool(
    "start_session",
    {
      title: "Start a guided lesson",
      description:
        "Opens a full-screen overlay that dims the screen and shows an intro card with Start/Exit. " +
        "Plan the whole lesson before calling this (observe works before a lesson, too). Then call wait_for_user; " +
        "the user pressing Start returns event 'next'. Pass workspace (the repo folder) so the right VS Code window is used. " +
        "The user performs every action themselves: never click, type or run commands for them during a lesson.",
      inputSchema: {
        title: z.string().min(1).max(120).describe("Lesson title, e.g. 'Tour of this FastAPI repo'."),
        intro: z.string().min(1).max(2000).describe("Markdown: what the lesson covers and roughly how long it takes."),
        workspace: z.string().max(1000).optional().describe("Absolute path of the repo folder open in VS Code."),
      },
    },
    ({ title, intro, workspace }) =>
      run(async () => {
        const started = await coordinator.startSession({ title, intro, workspace });
        return { session_id: started.sessionId, ide_window: started.ideWindow };
      }),
  );

  server.registerTool(
    "show_step",
    {
      title: "Show a lesson step",
      description:
        "Highlights up to 3 screen areas and shows an explanation bubble next to them. Prefer describing targets " +
        "(ui / text / lines) over coordinates; use rects read off observe only when nothing else fits. " +
        "Returns immediately with what was drawn (resolved: rect, method, confidence) and what was not (unresolved: " +
        "reason); with verify, also a picture of the highlights to check before the user reads on. Then call wait_for_user. " +
        "mode 'read': the user reads and presses Next. 'click': tell the user what to click inside the highlight; they press Skip when done. " +
        "'do': tell the user exactly what to do (e.g. a command in a code block, then press Enter); they press Done when finished. " +
        "Keep the body short (under ~80 words) and say why the thing matters, not only what it is.",
      inputSchema: {
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(4000).describe("Markdown: **bold**, *italic*, `code`, fenced code blocks and lists."),
        targets: targetsSchema.describe("Areas to highlight; empty shows a centred card."),
        mode: z.enum(["read", "click", "do"]),
        step_label: z.string().max(20).optional().describe("Progress label such as '3/9'."),
        verify: z.boolean().default(false).describe("Return a screenshot with the highlights outlined, to check them."),
      },
    },
    ({ title, body, targets, mode, step_label, verify }) =>
      respond(async () => {
        const result = await coordinator.showStep({
          title,
          body,
          mode,
          label: step_label,
          verify,
          targets: targets.map((t) =>
            t.kind === "rect"
              ? { kind: "rect", x: t.x, y: t.y, w: t.w, h: t.h, space: t.space, screenshotId: t.screenshot_id }
              : t,
          ),
        });
        const summary = {
          step_id: result.stepId,
          resolved: result.resolved,
          unresolved: result.unresolved,
          ...(result.preview && { preview: result.preview.meta }),
        };
        const content: ToolResult["content"] = [{ type: "text", text: JSON.stringify(summary) }];
        if (result.preview) content.push({ type: "image", data: result.preview.png, mimeType: "image/png" });
        return { content };
      }),
  );

  server.registerTool(
    "open_location",
    {
      title: "Open a file at a line",
      description:
        "Opens a file in the lesson's VS Code window and reveals the line, to bring code on screen before talking " +
        "about it. A lines target in show_step does this by itself. This is presentation, not a hands-on step: " +
        "anything the user should learn to do, they do themselves.",
      inputSchema: {
        file: z.string().min(1).max(1000).describe("Absolute, or relative to the lesson's workspace."),
        line: z.number().int().min(1),
        column: z.number().int().min(1).optional(),
      },
    },
    ({ file, line, column }) => run(() => coordinator.openLocation({ file, line, column })),
  );

  server.registerTool(
    "observe",
    {
      title: "Look at the screen",
      description:
        "Screenshot of the VS Code window (default), the whole screen, or a region. The overlay is never in the picture. " +
        "With grid (default on), dotted lines every 100 px are labelled with physical screen coordinates: read a target's " +
        "edges off the labels and pass them to show_step as a 'screen' rect. Alternatively use pixel positions in the " +
        "image with space 'screenshot' and the returned screenshot_id. Observe again after the user scrolls, opens files " +
        "or runs commands, and to check the result of a 'do' step.",
      inputSchema: {
        region: z
          .union([z.enum(["ide", "screen"]), regionSchema])
          .default("ide")
          .describe("'ide', 'screen', or {x, y, w, h} in physical screen pixels."),
        grid: z.boolean().default(true),
        max_width: z.number().int().min(400).max(2000).default(1600).describe("The image is shrunk to at most this width."),
      },
    },
    ({ region, grid, max_width }) =>
      respond(async () => {
        const { png, meta } = await coordinator.observe({ region, grid, maxWidth: max_width });
        return {
          content: [
            { type: "image", data: png, mimeType: "image/png" },
            { type: "text", text: JSON.stringify(meta) },
          ],
        };
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
