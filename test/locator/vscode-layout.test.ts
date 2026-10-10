import { describe, expect, it } from "vitest";
import { UiaTree } from "../../src/locator/uia.js";
import { locateUi, type UiElement } from "../../src/locator/vscode-layout.js";
import { explorerAndTerminal, searchOpenPanelClosed, sidebarHidden, vietnameseUi } from "../fixtures/uia/vscode-layout.js";

const locate = (element: UiElement, snapshot = explorerAndTerminal()) => locateUi(new UiaTree(snapshot), element);

describe("UiaTree", () => {
  it("knows parents, children and classes", () => {
    const tree = new UiaTree(explorerAndTerminal());
    const editor = tree.find((node) => node.id === "workbench.parts.editor")!;
    expect(tree.children(editor).map((c) => c.t)).toEqual(["TabItem", "TabItem", "Pane"]);
    expect(tree.parent(tree.children(editor)[0])).toBe(editor);
    expect(tree.hasClasses(editor, ["part", "editor"])).toBe(true);
    expect(tree.hasClasses(editor, ["part", "panel"])).toBe(false);
  });

  it("ignores nodes without a rect or outside the window when asked for visible ones", () => {
    const tree = new UiaTree(explorerAndTerminal());
    expect(tree.findAll((n) => n.c === "native-edit-context")).toHaveLength(1);
    expect(tree.findAll((n) => n.c === "native-edit-context", { visible: true })).toHaveLength(0);
  });
});

describe("locateUi on VS Code", () => {
  it("finds the editor area and the status bar by their ids", () => {
    expect(locate("editor")).toEqual({ rect: { x: 713, y: 43, w: 1202, h: 454 }, detail: "view" });
    expect(locate("status_bar")).toEqual({ rect: { x: 0, y: 985, w: 1920, h: 35 }, detail: "view" });
  });

  it("finds the activity bar as the vertical view switcher", () => {
    expect(locate("activity_bar")).toEqual({ rect: { x: 9, y: 48, w: 46, h: 596 }, detail: "view" });
  });

  it("derives the sidebar between the activity bar and the sidebar sash", () => {
    expect(locate("sidebar")).toEqual({ rect: { x: 55, y: 43, w: 653, h: 942 }, detail: "view" });
  });

  it("shows an open view as the sidebar and a closed view as its activity bar icon", () => {
    expect(locate("explorer")).toEqual({ rect: { x: 55, y: 43, w: 653, h: 942 }, detail: "view" });
    expect(locate("search")).toEqual({ rect: { x: 9, y: 103, w: 46, h: 46 }, detail: "icon" });
    expect(locate("run_debug")).toEqual({ rect: { x: 9, y: 213, w: 46, h: 46 }, detail: "icon" });
    expect(locate("explorer", searchOpenPanelClosed())).toEqual({ rect: { x: 9, y: 48, w: 46, h: 46 }, detail: "icon" });
    expect(locate("search", searchOpenPanelClosed())).toMatchObject({ detail: "view" });
  });

  it("finds the terminal and the panel around it", () => {
    expect(locate("terminal")).toEqual({ rect: { x: 714, y: 542, w: 1200, h: 417 }, detail: "view" });
    expect(locate("panel")).toEqual({ rect: { x: 713, y: 502, w: 1202, h: 483 }, detail: "view" });
  });

  it("finds the editor tab strip and the active tab", () => {
    expect(locate("tabs")).toEqual({ rect: { x: 713, y: 43, w: 250, h: 35 }, detail: "view" });
    expect(locate("active_tab")).toEqual({ rect: { x: 713, y: 43, w: 120, h: 35 }, detail: "view" });
  });

  it("reports parts that are not on screen", () => {
    expect(locate("terminal", searchOpenPanelClosed())).toEqual({ reason: "not_visible" });
    expect(locate("panel", searchOpenPanelClosed())).toEqual({ reason: "not_visible" });
    expect(locate("sidebar", sidebarHidden())).toEqual({ reason: "not_visible" });
    expect(locate("explorer", sidebarHidden())).toEqual({ rect: { x: 9, y: 48, w: 46, h: 46 }, detail: "icon" });
  });

  it("does not depend on the UI language", () => {
    expect(locate("activity_bar", vietnameseUi())).toEqual(locate("activity_bar"));
    expect(locate("panel", vietnameseUi())).toEqual(locate("panel"));
    expect(locate("explorer", vietnameseUi())).toEqual(locate("explorer"));
  });

  it("reports when this is not VS Code at all", () => {
    const other = { window: [0, 0, 800, 600], truncated: false, attempts: 1, ms: 5, nodes: [explorerAndTerminal().nodes[0]] };
    expect(locate("editor", other)).toEqual({ reason: "element_not_found" });
  });
});
