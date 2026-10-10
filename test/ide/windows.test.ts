import { describe, expect, it } from "vitest";
import { chooseIdeWindow, type WindowInfo } from "../../src/ide/windows.js";

const win = (hwnd: number, title: string, process = "Code"): WindowInfo => ({
  hwnd,
  title,
  process,
  bounds: { x: 0, y: 0, w: 1920, h: 1020 },
  minimized: false,
  foreground: false,
});

const windows = [
  win(1, "notes.md - Easy_Instruct - Visual Studio Code"),
  win(2, "main.py - fastapi-demo - Visual Studio Code"),
  win(3, "Inbox - Mail", "olk"),
];

describe("chooseIdeWindow", () => {
  it("picks the VS Code window whose title names the workspace folder", () => {
    expect(chooseIdeWindow(windows, "C:\\Repos\\fastapi-demo")?.hwnd).toBe(2);
  });

  it("ignores trailing separators and letter case in the workspace path", () => {
    expect(chooseIdeWindow(windows, "c:/repos/FastAPI-Demo/")?.hwnd).toBe(2);
  });

  it("falls back to the topmost VS Code window when nothing matches", () => {
    expect(chooseIdeWindow(windows, "C:/elsewhere/other-repo")?.hwnd).toBe(1);
  });

  it("uses the topmost VS Code window without a workspace", () => {
    expect(chooseIdeWindow(windows)?.hwnd).toBe(1);
  });

  it("returns null when VS Code is not open", () => {
    expect(chooseIdeWindow([win(3, "Inbox - Mail", "olk")], "C:/x")).toBeNull();
  });

  it("does not match a folder name that is only part of another word", () => {
    const list = [win(1, "a.ts - api-gateway - Visual Studio Code"), win(2, "b.ts - api - Visual Studio Code")];
    expect(chooseIdeWindow(list, "C:/src/api")?.hwnd).toBe(2);
  });
});
