import type { UiaSnapshot } from "../../../src/locator/uia.js";

// Hand-made snapshots shaped like real VS Code 1.10x dumps (maximized at 125%, physical pixels),
// trimmed to the nodes the locator looks at. Names are made up; no real files or chats.

type Node = UiaSnapshot["nodes"][number];
const n = (p: number, d: number, t: string, c: string, r: number[] | null, extra: Partial<Node> = {}): Node => ({
  p,
  d,
  t,
  n: "",
  id: "",
  c,
  r,
  ...extra,
});

/** Explorer open in the sidebar, two editor tabs with sticky scroll, terminal panel open. */
export function explorerAndTerminal(): UiaSnapshot {
  return {
    window: [0, 0, 1920, 1020],
    truncated: false,
    attempts: 1,
    ms: 200,
    nodes: [
      /* 0 */ n(-1, 0, "Window", "Chrome_WidgetWin_1", [0, 0, 1920, 1020], { n: "app.py - demo - Visual Studio Code" }),
      /* 1 */ n(0, 1, "Pane", "RootView", [0, 0, 1920, 1020]),
      /* 2 */ n(1, 2, "Pane", "monaco-workbench windows", [0, 0, 1920, 1020]),
      /* 3 */ n(2, 3, "Tab", "actions-container", [9, 48, 46, 596], { n: "Active View Switcher" }),
      /* 4 */ n(3, 4, "TabItem", "action-item icon checked", [9, 48, 46, 46], { n: "Explorer (Ctrl+Shift+E)" }),
      /* 5 */ n(4, 5, "Group", "action-label codicon codicon-explorer-view-icon", [9, 48, 46, 46], { n: "Explorer (Ctrl+Shift+E)" }),
      /* 6 */ n(3, 4, "TabItem", "action-item icon", [9, 103, 46, 46], { n: "Search (Ctrl+Shift+F)" }),
      /* 7 */ n(6, 5, "Group", "action-label codicon codicon-search-view-icon", [9, 103, 46, 46], { n: "Search (Ctrl+Shift+F)" }),
      /* 8 */ n(3, 4, "TabItem", "action-item icon", [9, 213, 46, 46], { n: "Run and Debug (Ctrl+Shift+D)" }),
      /* 9 */ n(8, 5, "Group", "action-label codicon codicon-run-view-icon", [9, 213, 46, 46], { n: "Run and Debug (Ctrl+Shift+D)" }),
      /* 10 */ n(2, 3, "Button", "pane-header expanded", [66, 119, 636, 36], { n: "Explorer Section: demo" }),
      /* 11 */ n(2, 3, "Tree", "monaco-list list_id_3 mouse-support", [61, 154, 646, 634], { n: "Files Explorer" }),
      /* 12 */ n(11, 4, "TreeItem", "monaco-list-row", [61, 154, 646, 22], { n: "app.py" }),
      /* 13 */ n(12, 5, "Group", "monaco-icon-label", [80, 154, 600, 22], { n: "C:\\repos\\demo\\app.py" }),
      /* 14 */ n(11, 4, "TreeItem", "monaco-list-row", [61, 176, 646, 22], { n: "README.md" }),
      /* 15 */ n(14, 5, "Group", "monaco-icon-label", [80, 176, 600, 22], { n: "C:\\repos\\demo\\README.md" }),
      /* 16 */ n(2, 3, "Group", "monaco-sash vertical primary-sidebar-sash", [708, 43, 6, 942]),
      /* 17 */ n(2, 3, "Group", "part editor editor-tabs-multiple", [713, 43, 1202, 454], { id: "workbench.parts.editor" }),
      /* 18 */ n(17, 4, "TabItem", "tab tab-actions-right sizing-fit has-icon active selected", [713, 43, 120, 35], { n: "app.py" }),
      /* 19 */ n(17, 4, "TabItem", "tab tab-actions-right sizing-fit has-icon", [833, 43, 130, 35], { n: "README.md" }),
      /* 20 */ n(17, 4, "Pane", "monaco-editor no-user-select showUnused vs-dark focused", [713, 113, 1202, 384]),
      /* 21 */ n(20, 5, "Group", "sticky-widget", [713, 113, 1180, 24]),
      /* 22 */ n(21, 6, "ListItem", "sticky-line-content stickyLine12", [790, 113, 1100, 24], { n: "def main():" }),
      /* 23 */ n(20, 5, "Edit", "native-edit-context", null, { n: "The editor is not accessible at this time." }),
      /* 24 */ n(2, 3, "Tab", "actions-container", [717, 502, 451, 41], { n: "Active View Switcher" }),
      /* 25 */ n(24, 4, "TabItem", "action-item", [717, 502, 93, 41], { n: "Problems (Ctrl+Shift+M)" }),
      /* 26 */ n(24, 4, "TabItem", "action-item checked", [1020, 502, 87, 41], { n: "Terminal (Ctrl+`)" }),
      /* 27 */ n(2, 3, "Group", "terminal xterm", [714, 542, 1200, 417]),
      /* 28 */ n(27, 4, "Group", "xterm-screen", [739, 552, 1162, 397]),
      /* 29 */ n(2, 3, "StatusBar", "part statusbar status-border-top", [0, 985, 1920, 35], { id: "workbench.parts.statusbar" }),
    ],
  };
}

/** Same window with Search open instead of Explorer and the panel closed. */
export function searchOpenPanelClosed(): UiaSnapshot {
  const snapshot = explorerAndTerminal();
  const keep = snapshot.nodes.map((node, i) => {
    if (i === 4) return { ...node, c: "action-item icon" };
    if (i === 6) return { ...node, c: "action-item icon checked" };
    if (i === 17) return { ...node, r: [713, 43, 1202, 942] };
    return node;
  });
  // Drop the Explorer tree (10-15) and the panel (24-28); re-index parents.
  return reindex({ ...snapshot, nodes: keep }, new Set([10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28]));
}

/** Sidebar hidden (Ctrl+B): no sash, no tree. */
export function sidebarHidden(): UiaSnapshot {
  return reindex(explorerAndTerminal(), new Set([10, 11, 12, 13, 14, 15, 16]));
}

/** VS Code in Vietnamese: every name translated, ids and classes unchanged. */
export function vietnameseUi(): UiaSnapshot {
  const snapshot = explorerAndTerminal();
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) =>
      node.n === "Active View Switcher" ? { ...node, n: "Trình chuyển chế độ xem" } : node.t === "TabItem" || node.t === "Group" ? { ...node, n: `VN ${node.n}` } : node,
    ),
  };
}

function reindex(snapshot: UiaSnapshot, drop: Set<number>): UiaSnapshot {
  const map = new Map<number, number>();
  const nodes: Node[] = [];
  snapshot.nodes.forEach((node, i) => {
    if (drop.has(i)) return;
    map.set(i, nodes.length);
    nodes.push({ ...node, p: node.p < 0 ? -1 : map.get(node.p)! });
  });
  return { ...snapshot, nodes };
}

/** The same snapshot with the window moved by dx, dy. */
export function shifted(snapshot: UiaSnapshot, dx: number, dy: number): UiaSnapshot {
  const move = (r: number[] | null) => (r ? [r[0] + dx, r[1] + dy, r[2], r[3]] : r);
  return { ...snapshot, window: move(snapshot.window)!, nodes: snapshot.nodes.map((node) => ({ ...node, r: move(node.r) })) };
}
