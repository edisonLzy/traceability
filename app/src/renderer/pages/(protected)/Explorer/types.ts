import type { AppRouterInputs, AppRouterOutputs } from "@shared/trpc-types";
import type { Edge, Node } from "@xyflow/react";

/**
 * Explorer's wire types are inferred from the server router. This keeps the
 * renderer aligned with the API contract without maintaining a second copy of
 * the graph payload definitions.
 */
export type ExplorerGraphSummary = AppRouterOutputs["graphs"]["list"][number];
export type ExplorerGraphSnapshot = NonNullable<AppRouterOutputs["graphs"]["get"]>;
export type ExplorerNode = ExplorerGraphSnapshot["nodes"][number];
export type ExplorerEdge = ExplorerGraphSnapshot["edges"][number];
export type ExplorerNodeType = ExplorerNode["type"];
export type ExplorerNodeData = ExplorerNode["data"];
export type ExplorerEdgeData = ExplorerEdge["data"];
export type ExplorerRelationship = ExplorerEdgeData["relation"];
export type GraphOperation = AppRouterInputs["graphs"]["applyOperations"]["operations"][number];
export type ApplyGraphOperationsInput = AppRouterInputs["graphs"]["applyOperations"];
export type ApplyGraphOperationsResult = AppRouterOutputs["graphs"]["applyOperations"];
export type GraphOperationRecord = AppRouterOutputs["graphs"]["getOperations"][number];

export type ExplorerFlowNode = Node<ExplorerNodeData, ExplorerNodeType>;
export type ExplorerFlowEdge = Edge<ExplorerEdgeData>;

export interface GraphCommittedEvent {
  type: "graph.operation.committed";
  graphId: string;
  graphVersion: number;
  operationId: string;
  operations: GraphOperation[];
}

export type ExplorerRealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";
