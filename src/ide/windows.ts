import type { Rect } from "../shared/geometry.js";

/** A top-level window as win-helper's list_windows reports it. */
export interface WindowInfo {
  hwnd: number;
  title: string;
  process: string;
  /** The process executable; "" when Windows does not tell. */
  path?: string;
  bounds: Rect;
  minimized: boolean;
  foreground: boolean;
}

const VS_CODE_PROCESS = "code";

function folderName(workspace: string): string {
  const parts = workspace.split(/[\\/]+/).filter(Boolean);
  return (parts.at(-1) ?? "").toLowerCase();
}

/**
 * The VS Code window for a workspace. VS Code titles look like "file - folder - Visual Studio Code",
 * so a window matches when one " - " segment equals the folder name. Without a match, the
 * topmost VS Code window (list_windows returns z-order) is used.
 */
export function chooseIdeWindow(windows: WindowInfo[], workspace?: string): WindowInfo | null {
  const vscode = windows.filter((w) => w.process.toLowerCase() === VS_CODE_PROCESS);
  if (workspace) {
    const folder = folderName(workspace);
    const match = vscode.find((w) => w.title.split(" - ").some((part) => part.trim().toLowerCase() === folder));
    if (match) return match;
  }
  return vscode[0] ?? null;
}
