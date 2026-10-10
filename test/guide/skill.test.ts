import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCATE_FAILURES } from "../../src/locator/locator.js";
import { UI_ELEMENTS } from "../../src/locator/vscode-layout.js";
import { RECT_FAILURES, TOOL_ERROR_CODES, WAIT_EVENTS } from "../../src/server/coordinator.js";
import { guideDir, listGuide } from "../../src/server/guide.js";

// The skill is the agent's manual: these tests fail when the code gains a reason, code, event
// or UI part that the manual does not explain, or when a link in it breaks.
const dir = guideDir();
const read = (rel: string) => readFileSync(path.join(dir, rel), "utf8");

describe("the easy-instruct skill", () => {
  it("has the frontmatter Claude Code needs to trigger it", () => {
    const skill = read("SKILL.md");
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skill.replace(/\r\n/g, "\n"))?.[1] ?? "";
    expect(frontmatter).toMatch(/^name: easy-instruct$/m);
    const description = /^description: (.+)$/m.exec(frontmatter)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(200);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).toMatch(/dạy mình/);
  });

  it("keeps SKILL.md short and the details in references", () => {
    expect(read("SKILL.md").split("\n").length).toBeLessThan(200);
  });

  it("only links to files that exist", () => {
    for (const rel of listGuide(dir)) {
      const links = [...read(rel).matchAll(/\]\(([^)#]+\.md)\)/g)].map((m) => m[1]);
      for (const link of links) {
        expect(existsSync(path.join(dir, path.dirname(rel), link)), `${rel} → ${link}`).toBe(true);
      }
    }
  });

  it("explains every unresolved reason, tool error code and wait_for_user event", () => {
    const recovery = read("references/recovery.md");
    for (const term of [...LOCATE_FAILURES, ...RECT_FAILURES, ...TOOL_ERROR_CODES, ...WAIT_EVENTS]) {
      expect(recovery, term).toContain(`\`${term}\``);
    }
  });

  it("documents every VS Code part a ui target can name", () => {
    const targets = read("references/targets.md");
    for (const element of UI_ELEMENTS) expect(targets, element).toContain(`\`${element}\``);
  });
});
