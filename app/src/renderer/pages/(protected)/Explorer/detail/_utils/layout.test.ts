import { describe, expect, it } from "vitest";

import {
  getHorizontalTreeLayout,
  isGraphOverlapping,
  type LayoutEdge,
  type LayoutNode,
} from "./layout";

describe("HorizontalTreeLayout", () => {
  it("handles empty nodes", () => {
    expect(getHorizontalTreeLayout([], [])).toEqual([]);
  });

  it("handles single node", () => {
    const nodes: LayoutNode[] = [{ id: "n1", position: { x: 0, y: 0 } }];
    const layouted = getHorizontalTreeLayout(nodes, []);
    expect(layouted).toEqual([{ id: "n1", position: { x: 80, y: 80 } }]);
  });

  it("lays out a left-to-right tree with root, findings, and leaves", () => {
    const nodes: LayoutNode[] = [
      { id: "q1", position: { x: 80, y: 80 } },
      { id: "f1", position: { x: 80, y: 80 } },
      { id: "f2", position: { x: 80, y: 80 } },
      { id: "c1", position: { x: 80, y: 80 } },
      { id: "issue1", position: { x: 80, y: 80 } },
    ];
    const edges: LayoutEdge[] = [
      { source: "q1", target: "f1" },
      { source: "q1", target: "f2" },
      { source: "f1", target: "c1" },
      { source: "f2", target: "issue1" },
    ];

    const result = getHorizontalTreeLayout(nodes, edges, {
      horizontalGap: 340,
      verticalGap: 160,
      startX: 80,
      startY: 80,
    });

    const posMap = new Map(result.map((n) => [n.id, n.position]));
    const q1 = posMap.get("q1")!;
    const f1 = posMap.get("f1")!;
    const f2 = posMap.get("f2")!;
    const c1 = posMap.get("c1")!;
    const issue1 = posMap.get("issue1")!;

    // Verify left-to-right hierarchy (X coordinates increase strictly with depth)
    expect(q1.x).toBe(80);
    expect(f1.x).toBe(80 + 340);
    expect(f2.x).toBe(80 + 340);
    expect(c1.x).toBe(80 + 2 * 340);
    expect(issue1.x).toBe(80 + 2 * 340);

    // Verify siblings have at least verticalGap clearance (no Y overlap)
    expect(Math.abs(f1.y - f2.y)).toBeGreaterThanOrEqual(160);
    expect(Math.abs(c1.y - issue1.y)).toBeGreaterThanOrEqual(160);

    // Verify parent is vertically centered between its children
    expect(q1.y).toBe((f1.y + f2.y) / 2);

    // Verify overall graph is not overlapping
    expect(isGraphOverlapping(result)).toBe(false);
  });

  it("handles disconnected components with vertical separation", () => {
    const nodes: LayoutNode[] = [
      { id: "tree1_root", position: { x: 0, y: 0 } },
      { id: "tree1_child", position: { x: 0, y: 0 } },
      { id: "tree2_root", position: { x: 0, y: 0 } },
      { id: "tree2_child", position: { x: 0, y: 0 } },
    ];
    const edges: LayoutEdge[] = [
      { source: "tree1_root", target: "tree1_child" },
      { source: "tree2_root", target: "tree2_child" },
    ];

    const result = getHorizontalTreeLayout(nodes, edges, {
      horizontalGap: 300,
      verticalGap: 150,
      componentGap: 100,
      startX: 50,
      startY: 50,
    });

    const posMap = new Map(result.map((n) => [n.id, n.position]));
    const t1Root = posMap.get("tree1_root")!;
    const t2Root = posMap.get("tree2_root")!;

    expect(t1Root.x).toBe(50);
    expect(t2Root.x).toBe(50);
    expect(t2Root.y).toBeGreaterThanOrEqual(t1Root.y + 100);
    expect(isGraphOverlapping(result)).toBe(false);
  });

  it("detects overlapping nodes with isGraphOverlapping", () => {
    const overlapping: LayoutNode[] = [
      { id: "a", position: { x: 80, y: 80 } },
      { id: "b", position: { x: 80, y: 80 } },
    ];
    expect(isGraphOverlapping(overlapping)).toBe(true);

    const nonOverlapping: LayoutNode[] = [
      { id: "a", position: { x: 80, y: 80 } },
      { id: "b", position: { x: 420, y: 80 } },
    ];
    expect(isGraphOverlapping(nonOverlapping)).toBe(false);
  });
});
