import { trpc } from "@renderer/lib/trpc";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import type {
  ApplyGraphOperationsResult,
  ExplorerGraphSnapshot,
  ExplorerNode,
  GraphOperation,
} from "../../types";

export interface ExplorerGraphState {
  snapshot: ExplorerGraphSnapshot | null;
  snapshotRef: MutableRefObject<ExplorerGraphSnapshot | null>;
  appliedOperationIdsRef: MutableRefObject<Set<string>>;
  commitSnapshot: (next: ExplorerGraphSnapshot) => void;
  resync: () => Promise<ExplorerGraphSnapshot | null>;
  error: Error | null;
  isLoading: boolean;
}

/**
 * Owns the client-local graph state: the `graphs.get` query, the current
 * snapshot, and the set of operation IDs this client already reconciled. The
 * realtime and apply-operations hooks read and write this state.
 */
export function useExplorerGraphState(
  projectId: string | undefined,
  graphId: string | undefined,
): ExplorerGraphState {
  const query = trpc.graphs.get.useQuery(
    { projectId: projectId ?? "", graphId: graphId ?? "" },
    { enabled: Boolean(projectId && graphId), staleTime: 0 },
  );
  const [snapshot, setSnapshot] = useState<ExplorerGraphSnapshot | null>(null);
  const snapshotRef = useRef<ExplorerGraphSnapshot | null>(null);
  const appliedOperationIdsRef = useRef(new Set<string>());

  const commitSnapshot = useCallback((next: ExplorerGraphSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    if (!query.data) return;
    commitSnapshot(query.data);
  }, [query.data, commitSnapshot]);

  const resync = useCallback(async () => {
    const result = await query.refetch();
    if (result.data) commitSnapshot(result.data);
    return result.data ?? null;
  }, [query, commitSnapshot]);

  return {
    snapshot,
    snapshotRef,
    appliedOperationIdsRef,
    commitSnapshot,
    resync,
    error: query.error as Error | null,
    isLoading: query.isLoading,
  };
}

// Pure snapshot transforms shared by the realtime and apply-operations hooks.
// Kept here in the snapshot domain rather than lib/, which holds only
// cross-module utilities.

export function applyOperationsToSnapshot(
  snapshot: ExplorerGraphSnapshot,
  operations: readonly GraphOperation[],
  idMappings: Record<string, string> = {},
): ExplorerGraphSnapshot {
  const resolveId = (id: string) => idMappings[id] ?? id;
  let nodes = snapshot.nodes.map((node) => ({ ...node, position: { ...node.position } }));
  let edges = snapshot.edges.map((edge) => ({ ...edge, data: { ...edge.data } }));

  for (const operation of operations) {
    switch (operation.op) {
      case "createNode":
        nodes = [
          ...nodes,
          {
            id: resolveId(operation.id),
            type: operation.type,
            position: { ...operation.position },
            data: operation.data,
          },
        ];
        break;
      case "updateNode": {
        const id = resolveId(operation.id);
        nodes = nodes.map((node) => {
          if (node.id !== id) return node;
          return {
            ...node,
            ...(operation.position ? { position: { ...operation.position } } : {}),
            ...(operation.data ? { data: mergeNodeData(node, operation.data) } : {}),
          };
        });
        break;
      }
      case "deleteNode": {
        const id = resolveId(operation.id);
        nodes = nodes.filter((node) => node.id !== id);
        edges = edges.filter((edge) => edge.source !== id && edge.target !== id);
        break;
      }
      case "moveNodes": {
        const positions = new Map(
          operation.positions.map(({ id, position }) => [resolveId(id), position]),
        );
        nodes = nodes.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, position: { ...position } } : node;
        });
        break;
      }
      case "createEdge":
        edges = [
          ...edges,
          {
            id: resolveId(operation.id),
            source: resolveId(operation.source),
            target: resolveId(operation.target),
            sourceHandle: operation.sourceHandle ?? null,
            targetHandle: operation.targetHandle ?? null,
            data: { relation: operation.relation },
          },
        ];
        break;
      case "updateEdge":
        edges = edges.map((edge) =>
          edge.id === resolveId(operation.id) && operation.relation
            ? { ...edge, data: { ...edge.data, relation: operation.relation } }
            : edge,
        );
        break;
      case "deleteEdge":
        edges = edges.filter((edge) => edge.id !== resolveId(operation.id));
        break;
    }
  }

  return { ...snapshot, nodes, edges };
}

export function reconcileOperationResult(
  snapshot: ExplorerGraphSnapshot,
  _operations: readonly GraphOperation[],
  result: ApplyGraphOperationsResult,
): ExplorerGraphSnapshot {
  const mappings: Record<string, string> = { ...result.idMappings };
  for (const item of result.applied) {
    if (item.op === "createNode" && item.nodeId) mappings[item.id] = item.nodeId;
    if (item.op === "createEdge" && item.edgeId) mappings[item.id] = item.edgeId;
  }

  const operationsToApply = _operations.filter((operation) => {
    if (operation.op === "createNode") {
      return !snapshot.nodes.some(
        (node) => node.id === operation.id || node.id === mappings[operation.id],
      );
    }
    if (operation.op === "createEdge") {
      return !snapshot.edges.some(
        (edge) => edge.id === operation.id || edge.id === mappings[operation.id],
      );
    }
    return true;
  });
  const mapped = applyOperationsToSnapshot(snapshot, operationsToApply);
  const remappedNodes = mapped.nodes.map((node) => ({
    ...node,
    id: mappings[node.id] ?? node.id,
  }));
  const remappedEdges = mapped.edges.map((edge) => ({
    ...edge,
    id: mappings[edge.id] ?? edge.id,
    source: mappings[edge.source] ?? edge.source,
    target: mappings[edge.target] ?? edge.target,
  }));

  return { ...mapped, nodes: remappedNodes, edges: remappedEdges };
}

function mergeNodeData(node: ExplorerNode, patch: Record<string, unknown>) {
  return { ...node.data, ...patch } as ExplorerNode["data"];
}
