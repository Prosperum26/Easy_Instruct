import uiMap from "../../config/vscode-ui-map.json" with { type: "json" };
import { clipToBounds, union, type Rect } from "../shared/geometry.js";
import type { TreeNode, UiaTree } from "./uia.js";

export type ViewName = keyof typeof uiMap.views;
export type UiElement = "editor" | "status_bar" | "activity_bar" | "sidebar" | "panel" | "terminal" | "tabs" | "active_tab" | ViewName;

export const UI_ELEMENTS: UiElement[] = [
  "editor",
  "status_bar",
  "activity_bar",
  "sidebar",
  "panel",
  "terminal",
  "tabs",
  "active_tab",
  ...(Object.keys(uiMap.views) as ViewName[]),
];

/**
 * A located part. detail "view" is the part itself; "icon" is the activity bar icon that opens a
 * view that is currently closed, so the lesson can say "click here".
 */
export type UiLocation = { rect: Rect; detail: "view" | "icon" } | { reason: "not_visible" | "element_not_found" };

const isView = (element: UiElement): element is ViewName => element in uiMap.views;

/**
 * Finds VS Code parts in a UI Automation snapshot. Chromium does not expose the sidebar or panel
 * containers, so those are derived from landmarks that are exposed (see config/vscode-ui-map.json).
 */
export function locateUi(tree: UiaTree, element: UiElement): UiLocation {
  const layout = new Layout(tree);
  const found = isView(element) ? layout.view(element) : layout.part(element);
  if ("reason" in found) return found;
  const rect = clipToBounds(found.rect, tree.window);
  return rect ? { rect, detail: found.detail } : { reason: "not_visible" };
}

class Layout {
  constructor(private readonly tree: UiaTree) {}

  part(element: Exclude<UiElement, ViewName>): UiLocation {
    switch (element) {
      case "editor":
        return this.located(this.editorPart(), "element_not_found");
      case "status_bar":
        return this.located(this.statusBar(), "element_not_found");
      case "activity_bar":
        return this.located(this.activityBar(), "not_visible");
      case "sidebar": {
        const sidebar = this.sidebarRect();
        return sidebar ? { rect: sidebar, detail: "view" } : { reason: "not_visible" };
      }
      case "panel": {
        const panel = this.panelRect();
        return panel ? { rect: panel, detail: "view" } : { reason: "not_visible" };
      }
      case "terminal":
        return this.unionOf(this.tree.findAll((n) => this.tree.matches(n, uiMap.terminal), { visible: true }));
      case "tabs":
        return this.unionOf(this.editorTabs());
      case "active_tab":
        return this.unionOf(this.editorTabs().filter((tab) => this.tree.hasClasses(tab, [uiMap.activeClass])).slice(0, 1));
    }
  }

  /** An open view is the sidebar; a closed one is its activity bar icon. */
  view(name: ViewName): UiLocation {
    const icon = this.tree.find((n) => this.tree.hasClasses(n, [uiMap.views[name]]), { visible: true });
    const open =
      icon !== undefined &&
      [icon, this.tree.parent(icon)].some((n) => n !== undefined && this.tree.hasClasses(n, [uiMap.checkedClass]));
    const sidebar = this.sidebarRect();
    if (open && sidebar) return { rect: sidebar, detail: "view" };
    if (icon) return { rect: this.tree.visibleRect(icon)!, detail: "icon" };
    return { reason: "element_not_found" };
  }

  private located(node: TreeNode | undefined, reason: "not_visible" | "element_not_found"): UiLocation {
    const rect = node && this.tree.visibleRect(node);
    return rect ? { rect, detail: "view" } : { reason };
  }

  private unionOf(nodes: TreeNode[]): UiLocation {
    const rect = union(nodes.map((n) => this.tree.visibleRect(n)!).filter(Boolean));
    return rect ? { rect, detail: "view" } : { reason: "not_visible" };
  }

  private editorPart() {
    return this.tree.find((n) => this.tree.matches(n, uiMap.editorPart), { visible: true });
  }

  private statusBar() {
    return this.tree.find((n) => this.tree.matches(n, uiMap.statusBar), { visible: true });
  }

  private viewSwitchers() {
    return this.tree.findAll((n) => this.tree.matches(n, uiMap.viewSwitcher), { visible: true });
  }

  /** The vertical view switcher that holds the built-in view icons. */
  private activityBar() {
    const icons = Object.values(uiMap.views);
    return this.viewSwitchers().find((switcher) => {
      const rect = this.tree.visibleRect(switcher)!;
      return (
        rect.h > rect.w &&
        this.tree.nodes.some((n) => this.tree.isDescendant(n, switcher) && this.tree.classes(n).some((c) => icons.includes(c)))
      );
    });
  }

  /** The horizontal view switcher at the top of the panel (Problems, Output, Terminal...). */
  private panelTabs() {
    const editor = this.editorPart();
    const editorTop = editor ? this.tree.visibleRect(editor)!.y : -Infinity;
    return this.viewSwitchers().find((switcher) => {
      const rect = this.tree.visibleRect(switcher)!;
      return rect.w >= rect.h && rect.y > editorTop;
    });
  }

  /** Between the activity bar and the sidebar sash, from the top of the editor area to the status bar. */
  private sidebarRect(): Rect | null {
    const activity = this.activityBar();
    const sash = this.tree.find((n) => this.tree.matches(n, uiMap.sidebarSash), { visible: true });
    if (!activity || !sash) return null;
    const a = this.tree.visibleRect(activity)!;
    const s = this.tree.visibleRect(sash)!;
    const top = this.top();
    const bottom = this.bottom();
    // Sidebar on the left of the editor (default) or on the right (sidebar position: right).
    const [left, right] = s.x >= a.x + a.w ? [a.x + a.w, s.x] : [s.x + s.w, a.x];
    return right > left ? { x: left, y: top, w: right - left, h: bottom - top } : null;
  }

  private panelRect(): Rect | null {
    const tabs = this.panelTabs();
    if (!tabs) return null;
    const t = this.tree.visibleRect(tabs)!;
    const editor = this.editorPart();
    const e = editor ? this.tree.visibleRect(editor)! : null;
    const left = e ? e.x : t.x;
    const right = e ? e.x + e.w : this.tree.window.x + this.tree.window.w;
    return { x: left, y: t.y, w: right - left, h: this.bottom() - t.y };
  }

  private editorTabs() {
    const editor = this.editorPart();
    if (!editor) return [];
    return this.tree.findAll((n) => this.tree.matches(n, uiMap.editorTab) && this.tree.isDescendant(n, editor), { visible: true });
  }

  private top(): number {
    const editor = this.editorPart();
    return editor ? this.tree.visibleRect(editor)!.y : this.tree.window.y;
  }

  private bottom(): number {
    const status = this.statusBar();
    return status ? this.tree.visibleRect(status)!.y : this.tree.window.y + this.tree.window.h;
  }
}
