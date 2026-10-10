import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The agent's manual is the easy-instruct skill (skills/easy-instruct). Claude Code loads it as a
 * skill; every MCP client gets the same files as resources, a short summary as server
 * instructions, and the relevant parts inside prompts.
 */
export const GUIDE_URI = "easy-instruct://guide/";

/** skills/easy-instruct, two levels above both src/server (tests) and dist/server (the bundle). */
export function guideDir(): string {
  return fileURLToPath(new URL("../../skills/easy-instruct/", import.meta.url));
}

/** Every Markdown file of the guide, as sorted forward-slash paths relative to `dir`. */
export function listGuide(dir: string): string[] {
  const walk = (sub: string): string[] =>
    readdirSync(path.join(dir, sub), { withFileTypes: true }).flatMap((entry) => {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return walk(rel);
      return entry.name.endsWith(".md") ? [rel] : [];
    });
  return walk("").sort();
}

export function readGuide(dir: string, rel: string): string {
  if (!listGuide(dir).includes(rel)) throw new Error(`Not part of the guide: ${rel}`);
  return readFileSync(path.join(dir, ...rel.split("/")), "utf8");
}

/** A guide file without its YAML frontmatter, for embedding in a prompt. */
function body(dir: string, rel: string): string {
  return readGuide(dir, rel).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}

/** Sent to every client when it connects; the full manual is in the resources. */
export const SERVER_INSTRUCTIONS = `Easy Instruct teaches the user hands-on on their own screen: a full-screen overlay highlights a spot in VS Code (a panel, a file, lines of code, the terminal) and explains it in a bubble. Use it when the user wants to learn, explore or be walked through something in their IDE ("teach me this repo", "walk me through running it", "dạy mình repo này").

Rules that matter most:
- The user does every action. Never run commands, click or edit for them during a lesson; tell them exactly what to do (mode "do") and let them. open_location only brings code on screen.
- Describe targets ({kind:"ui"}, {kind:"text"}, {kind:"lines"}) instead of guessing coordinates; use rects read off an observe grid only as a fallback.
- Prepare the lesson (read the repo, plan 8-12 steps) before start_session, and pass workspace.
- Loop: show_step or show_card, then wait_for_user. After a "do" step, observe the screen before saying it worked.
- One idea per step, short bubbles, in the user's language.
- Check show_step's unresolved list and low confidence; every reason and error code has a remedy in the guide.

Read the full guide before your first lesson: ${GUIDE_URI}SKILL.md (workflow), then as needed ${GUIDE_URI}references/targets.md, ${GUIDE_URI}references/recovery.md, ${GUIDE_URI}references/lesson-design.md, and the flows under ${GUIDE_URI}references/flows/. In Claude Code the same guide is the easy-instruct skill.`;

const moreReading = `For details while teaching, read these resources: ${GUIDE_URI}references/targets.md (choosing targets), ${GUIDE_URI}references/recovery.md (unresolved reasons and error codes), ${GUIDE_URI}references/lesson-design.md.`;

/** The text of an MCP prompt: the request, the workflow from SKILL.md and the matching flow. */
export function promptText(dir: string, request: string, flow: string): string {
  return [request, "Follow this guide.", body(dir, "SKILL.md"), body(dir, `references/flows/${flow}`), moreReading].join("\n\n---\n\n");
}
