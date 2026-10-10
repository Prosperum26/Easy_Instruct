import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VERSION } from "../../src/server/tools.js";

const root = path.resolve(__dirname, "../..");
const json = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"));

describe("version", () => {
  it("is the same in package.json, the plugin manifest and the MCP server", () => {
    const version = json("package.json").version;
    expect(json(".claude-plugin/plugin.json").version).toBe(version);
    expect(VERSION).toBe(version);
  });

  it("ships everything the plugin and the server read at runtime", () => {
    const files: string[] = json("package.json").files;
    for (const needed of ["dist", "skills", "config", ".claude-plugin", ".mcp.json"]) expect(files).toContain(needed);
  });
});
