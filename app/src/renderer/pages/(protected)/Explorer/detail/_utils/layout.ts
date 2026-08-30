export interface LayoutNode {
  id: string;
  position: { x: number; y: number };
  [key: string]: unknown;
}

export interface LayoutEdge {
  source: string;
  target: string;
  [key: string]: unknown;
}

export interface HorizontalTreeLayoutOptions {
  /** Horizontal distance between hierarchy levels (columns). Defaults to 340px. */
  horizontalGap?: number;
  /** Minimum vertical distance between sibling nodes. Defaults to 160px. */
  verticalGap?: number;
  /** Initial top-left X position. Defaults to 80px. */
  startX?: number;
  /** Initial top-left Y position. Defaults to 80px. */
  startY?: number;
  /** Component vertical gap when multiple disconnected graphs exist. Defaults to 100px. */
  componentGap?: number;
}

/**
 * Computes a Left-to-Right (LR) tree / hierarchical DAG layout for Explorer Graph nodes.
 *
 * Characteristics:
 * - Roots (nodes with in-degree 0 or investigation starters) are anchored on the left.
 * - Children branch out to the right based on topological depth.
 * - Parent nodes are centered vertically relative to their children subtree.
 * - Sibling nodes and subtrees maintain sufficient vertical clearance to eliminate overlaps.
 * - Disconnected components are stacked vertically in a clean structure.
 */
export function getHorizontalTreeLayout<TNode extends LayoutNode, TEdge extends LayoutEdge>(
  nodes: readonly TNode[],
  edges: readonly TEdge[],
  options: HorizontalTreeLayoutOptions = {},
): TNode[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    const single = nodes[0];
    const startX = options.startX ?? 80;
    const startY = options.startY ?? 80;
    return [{ ...single, position: { x: startX, y: startY } }] as unknown as TNode[];
  }

  const horizontalGap = options.horizontalGap ?? 340;
  const verticalGap = options.verticalGap ?? 160;
  const startX = options.startX ?? 80;
  let currentComponentStartY = options.startY ?? 80;
  const componentGap = options.componentGap ?? 100;

  const nodeIds = new Set<string>(nodes.map((n) => n.id));

  // Build adjacency graphs
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  const undirectedNeighbors = new Map<string, Set<string>>();

  for (const id of nodeIds) {
    outEdges.set(id, []);
    inEdges.set(id, []);
    undirectedNeighbors.set(id, new Set());
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target) {
      outEdges.get(edge.source)!.push(edge.target);
      inEdges.get(edge.target)!.push(edge.source);
      undirectedNeighbors.get(edge.source)!.add(edge.target);
      undirectedNeighbors.get(edge.target)!.add(edge.source);
    }
  }

  // 1. Partition nodes into connected components
  const visitedForComponents = new Set<string>();
  const components: string[][] = [];

  for (const id of nodeIds) {
    if (visitedForComponents.has(id)) continue;
    const component: string[] = [];
    const queue = [id];
    visitedForComponents.add(id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of undirectedNeighbors.get(current) ?? []) {
        if (!visitedForComponents.has(neighbor)) {
          visitedForComponents.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  const positions = new Map<string, { x: number; y: number }>();

  // 2. Layout each component
  for (const component of components) {
    const compNodeIds = new Set(component);

    // Identify roots within this component
    const roots = component.filter(
      (id) => (inEdges.get(id)?.filter((p) => compNodeIds.has(p)).length ?? 0) === 0,
    );

    // If there is a cycle where all have in-degree > 0, pick the node with minimum in-degree
    if (roots.length === 0) {
      let minIn = Infinity;
      let fallback = component[0] ?? "";
      for (const id of component) {
        const inCount = inEdges.get(id)?.filter((p) => compNodeIds.has(p)).length ?? 0;
        if (inCount < minIn) {
          minIn = inCount;
          fallback = id;
        }
      }
      if (fallback) {
        roots.push(fallback);
      }
    }

    // Determine rank/depth using longest path from roots (DAG depth)
    const depthMap = new Map<string, number>();
    for (const r of roots) {
      depthMap.set(r, 0);
    }

    // BFS/Relaxation with cycle protection
    const queue = [...roots];
    const inQueueCount = new Map<string, number>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const curDepth = depthMap.get(current) ?? 0;
      const count = (inQueueCount.get(current) ?? 0) + 1;
      inQueueCount.set(current, count);

      if (count > component.length * 2) {
        // Cycle detected, break infinite loop
        continue;
      }

      for (const child of outEdges.get(current) ?? []) {
        if (!compNodeIds.has(child)) continue;
        const oldDepth = depthMap.get(child);
        const newDepth = curDepth + 1;
        if (oldDepth === undefined || newDepth > oldDepth) {
          depthMap.set(child, newDepth);
          queue.push(child);
        }
      }
    }

    // Ensure all nodes have a depth assigned
    for (const id of component) {
      if (!depthMap.has(id)) {
        depthMap.set(id, 0);
      }
    }

    // Subtree vertical assignment
    const visitedInTree = new Set<string>();
    let leafCursorY = currentComponentStartY;
    let maxCompY = currentComponentStartY;

    function layoutSubtree(nodeId: string): { topY: number; bottomY: number; centerY: number } {
      visitedInTree.add(nodeId);
      const validChildren = (outEdges.get(nodeId) ?? []).filter(
        (child) =>
          compNodeIds.has(child) &&
          !visitedInTree.has(child) &&
          (depthMap.get(child) ?? 0) > (depthMap.get(nodeId) ?? 0),
      );

      if (validChildren.length === 0) {
        const centerY = leafCursorY;
        const topY = centerY;
        const bottomY = centerY;
        leafCursorY += verticalGap;
        maxCompY = Math.max(maxCompY, centerY);

        const x = startX + (depthMap.get(nodeId) ?? 0) * horizontalGap;
        positions.set(nodeId, { x, y: centerY });
        return { topY, bottomY, centerY };
      }

      const childMetrics: Array<{ topY: number; bottomY: number; centerY: number }> = [];
      for (const child of validChildren) {
        childMetrics.push(layoutSubtree(child));
      }

      const firstChild = childMetrics[0];
      const lastChild = childMetrics[childMetrics.length - 1];
      const centerY =
        firstChild && lastChild ? (firstChild.centerY + lastChild.centerY) / 2 : leafCursorY;
      const topY = firstChild ? firstChild.topY : centerY;
      const bottomY = lastChild ? lastChild.bottomY : centerY;

      maxCompY = Math.max(maxCompY, bottomY);
      const x = startX + (depthMap.get(nodeId) ?? 0) * horizontalGap;
      positions.set(nodeId, { x, y: centerY });

      return { topY, bottomY, centerY };
    }

    for (const root of roots) {
      if (!visitedInTree.has(root)) {
        layoutSubtree(root);
      }
    }

    // Handle any unvisited nodes in component (e.g. cross-links or cycles)
    for (const id of component) {
      if (!positions.has(id)) {
        const d = depthMap.get(id) ?? 0;
        const x = startX + d * horizontalGap;
        positions.set(id, { x, y: leafCursorY });
        maxCompY = Math.max(maxCompY, leafCursorY);
        leafCursorY += verticalGap;
      }
    }

    // Column-wise overlap resolution: ensure nodes with identical or very close X
    // have at least verticalGap between their Y coordinates.
    const columns = new Map<number, string[]>();
    for (const id of component) {
      const pos = positions.get(id);
      if (pos) {
        if (!columns.has(pos.x)) {
          columns.set(pos.x, []);
        }
        columns.get(pos.x)!.push(id);
      }
    }

    for (const [_colX, colNodeIds] of columns.entries()) {
      if (colNodeIds.length <= 1) continue;
      colNodeIds.sort((a, b) => {
        const posA = positions.get(a);
        const posB = positions.get(b);
        return (posA?.y ?? 0) - (posB?.y ?? 0);
      });

      for (let i = 1; i < colNodeIds.length; i++) {
        const prevId = colNodeIds[i - 1];
        const currId = colNodeIds[i];
        if (!prevId || !currId) continue;
        const prevY = positions.get(prevId)?.y ?? 0;
        const currPos = positions.get(currId);

        if (currPos && currPos.y < prevY + verticalGap) {
          const newY = prevY + verticalGap;
          positions.set(currId, { ...currPos, y: newY });
          maxCompY = Math.max(maxCompY, newY);
        }
      }
    }

    currentComponentStartY = maxCompY + componentGap;
  }

  return nodes.map((node) => {
    const pos = positions.get(node.id) ?? node.position;
    return {
      ...node,
      position: { x: Math.round(pos.x), y: Math.round(pos.y) },
    };
  });
}

/**
 * Check if the nodes in a graph are severely overlapping or all stacked together.
 */
export function isGraphOverlapping<TNode extends LayoutNode>(
  nodes: readonly TNode[],
  thresholdX = 180,
  thresholdY = 100,
): boolean {
  if (nodes.length <= 1) return false;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];
      if (!nodeA || !nodeB) continue;
      const a = nodeA.position;
      const b = nodeB.position;
      if (Math.abs(a.x - b.x) < thresholdX && Math.abs(a.y - b.y) < thresholdY) {
        return true;
      }
    }
  }

  return false;
}
