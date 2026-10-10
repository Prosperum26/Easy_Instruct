import { describe, expect, it } from "vitest";
import { parseConnectArgs } from "../../overlay/args.js";

const token = "a".repeat(64);

describe("parseConnectArgs", () => {
  it("reads the port and token", () => {
    expect(parseConnectArgs(["electron", "main.cjs", "--port=51234", `--token=${token}`])).toEqual({
      port: 51234,
      token,
    });
  });

  it("returns null in demo mode (no port)", () => {
    expect(parseConnectArgs(["electron", "main.cjs"])).toBeNull();
  });

  it("rejects a port without a token", () => {
    expect(() => parseConnectArgs(["--port=51234"])).toThrow(/--token/);
  });

  it("rejects ports outside 1-65535", () => {
    expect(() => parseConnectArgs(["--port=0", `--token=${token}`])).toThrow(/--port/);
    expect(() => parseConnectArgs(["--port=70000", `--token=${token}`])).toThrow(/--port/);
    expect(() => parseConnectArgs(["--port=abc", `--token=${token}`])).toThrow(/--port/);
  });
});
