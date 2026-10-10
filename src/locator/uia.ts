import { intersects, type Rect } from "../shared/geometry.js";

/** One element of win-helper's uia_snapshot, in depth-first order. */
export interface UiaNode {
  /** Parent index, -1 for the window. */
  p: number;
  d: number;
  /** Control type, e.g. "TreeItem". */
  t: string;
  n: string;
  /** AutomationId; in Chromium apps, the DOM id. */
  id: string;
  /** Class name; in Chromium apps, the CSS classes. */
  c: string;
  /** [x, y, w, h] in physical pixels, or null. */
  r: number[] | null;
}

export interface UiaSnapshot {
  window: number[];
  nodes: UiaNode[];
  truncated: boolean;
  attempts: number;
  ms: number;
}

/** A node plus its index, so the tree can walk to its parent and children. */
export interface TreeNode extends UiaNode {
  index: number;
}

export interface Matcher {
  id?: string;
  type?: string;
  /** All of these CSS classes. */
  classes?: string[];
}

export const toRect = (r: number[]): Rect => ({ x: r[0], y: r[1], w: r[2], h: r[3] });

/** Read-only helpers over a flat uia_snapshot. */
export class UiaTree {
  readonly window: Rect;
  readonly nodes: TreeNode[];
  private readonly childIndex = new Map<number, TreeNode[]>();

  constructor(snapshot: UiaSnapshot) {
    this.window = toRect(snapshot.window);
    this.nodes = snapshot.nodes.map((node, index) => ({ ...node, index }));
    for (const node of this.nodes) {
      if (node.p < 0) continue;
      const siblings = this.childIndex.get(node.p) ?? [];
      siblings.push(node);
      this.childIndex.set(node.p, siblings);
    }
  }

  parent(node: TreeNode): TreeNode | undefined {
    return node.p >= 0 ? this.nodes[node.p] : undefined;
  }

  children(node: TreeNode): TreeNode[] {
    return this.childIndex.get(node.index) ?? [];
  }

  isDescendant(node: TreeNode, ancestor: TreeNode): boolean {
    for (let current = this.parent(node); current; current = this.parent(current)) {
      if (current === ancestor) return true;
    }
    return false;
  }

  classes(node: UiaNode): string[] {
    return node.c.split(/\s+/).filter(Boolean);
  }

  hasClasses(node: UiaNode, classes: string[]): boolean {
    const own = this.classes(node);
    return classes.every((c) => own.includes(c));
  }

  matches(node: UiaNode, matcher: Matcher): boolean {
    return (
      (matcher.id === undefined || node.id === matcher.id) &&
      (matcher.type === undefined || node.t === matcher.type) &&
      (matcher.classes === undefined || this.hasClasses(node, matcher.classes))
    );
  }

  /** The node's rect when it is on screen inside the window. */
  visibleRect(node: UiaNode): Rect | null {
    if (!node.r || node.r[2] <= 0 || node.r[3] <= 0) return null;
    const rect = toRect(node.r);
    return intersects(rect, this.window) ? rect : null;
  }

  find(predicate: (node: TreeNode) => boolean, options: { visible?: boolean } = {}): TreeNode | undefined {
    return this.findAll(predicate, options)[0];
  }

  findAll(predicate: (node: TreeNode) => boolean, options: { visible?: boolean } = {}): TreeNode[] {
    return this.nodes.filter((node) => predicate(node) && (!options.visible || this.visibleRect(node) !== null));
  }
}
