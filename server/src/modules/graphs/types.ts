import { z } from "zod";

export const GRAPH_NODE_TYPES = [
  "question",
  "finding",
  "issue",
  "event",
  "replay",
  "code",
  "document",
] as const;

export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number];

export const GRAPH_RELATIONSHIPS = [
  "investigates",
  "supports",
  "contradicts",
  "caused_by",
  "implemented_by",
  "observed_in",
  "related_to",
] as const;

export type GraphRelationship = (typeof GRAPH_RELATIONSHIPS)[number];

export type FindingStatus = "open" | "confirmed" | "rejected";

export type GraphStatus = "active" | "archived";

export interface QuestionNodeData {
  kind: "question";
  prompt: string;
  intent?: string;
}
export interface FindingNodeData {
  kind: "finding";
  summary: string;
  confidence?: number;
  status?: FindingStatus;
}
export interface IssueNodeData {
  kind: "issue";
  issueId: string;
}
export interface EventNodeData {
  kind: "event";
  eventId: string;
}
export interface ReplayNodeData {
  kind: "replay";
  replayId: string;
}
export interface CodeNodeData {
  kind: "code";
  path: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  snippet?: string;
}
export interface DocumentNodeData {
  kind: "document";
  title: string;
  path?: string;
  excerpt?: string;
}

export type GraphNodeData =
  | QuestionNodeData
  | FindingNodeData
  | IssueNodeData
  | EventNodeData
  | ReplayNodeData
  | CodeNodeData
  | DocumentNodeData;

export interface GraphEdgeData {
  relation: GraphRelationship;
}

/** Wire shape — structurally compatible with React Flow `Node`/`Edge`. */
export interface GraphNode {
  id: string;
  type: GraphNodeType;
  position: { x: number; y: number };
  data: GraphNodeData;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data: GraphEdgeData;
}

export interface GraphSummary {
  id: string;
  projectId: string;
  title: string;
  status: GraphStatus;
  version: number;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GraphSnapshot {
  id: string;
  projectId: string;
  title: string;
  status: GraphStatus;
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}

export interface GraphActor {
  type: "user" | "agent";
  sessionId?: string;
}

export type GraphOperation =
  | {
      op: "createNode";
      id: string;
      type: GraphNodeType;
      position: { x: number; y: number };
      data: GraphNodeData;
    }
  | {
      op: "updateNode";
      id: string;
      data?: Partial<GraphNodeData>;
      position?: { x: number; y: number };
    }
  | { op: "deleteNode"; id: string }
  | { op: "moveNodes"; positions: Array<{ id: string; position: { x: number; y: number } }> }
  | {
      op: "createEdge";
      id: string;
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
      relation: GraphRelationship;
    }
  | { op: "updateEdge"; id: string; relation?: GraphRelationship }
  | { op: "deleteEdge"; id: string };

export interface ApplyGraphOperationsInput {
  operationId: string;
  graphId: string;
  baseVersion: number;
  actor: GraphActor;
  operations: GraphOperation[];
}

export interface AppliedOperation {
  op: string;
  id: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ApplyGraphOperationsResult {
  graphId: string;
  version: number;
  alreadyApplied: boolean;
  idMappings: Record<string, string>;
  applied: AppliedOperation[];
}

export interface GraphOperationRecord {
  id: string;
  operationId: string;
  graphId: string;
  graphVersion: number;
  actorType: "user" | "agent" | "system";
  actorId: string;
  sessionId?: string | null;
  operations: GraphOperation[];
  createdAt: string;
}

/** Event published to the realtime bus after an operation commits. */
export interface GraphCommittedEvent {
  type: "graph.operation.committed";
  graphId: string;
  graphVersion: number;
  operationId: string;
  operations: GraphOperation[];
}

/** Internal, DB-shaped records the service resolves against. */
export interface GraphNodeRecord {
  id: string;
  type: string;
  data: GraphNodeData;
  positionX: number;
  positionY: number;
}

export interface GraphEdgeRecord {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  relation: string;
}

/** Concrete mutation plan assembled by the service and executed by the repository. */
export interface CommitNodeInsert {
  id: string;
  type: GraphNodeType;
  position: { x: number; y: number };
  data: GraphNodeData;
}
export interface CommitNodeUpdate {
  id: string;
  data?: GraphNodeData;
  position?: { x: number; y: number };
}
export interface CommitNodeDelete {
  id: string;
}
export interface CommitEdgeInsert {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  relation: GraphRelationship;
}
export interface CommitEdgeUpdate {
  id: string;
  relation?: GraphRelationship;
}
export interface CommitEdgeDelete {
  id: string;
}

export interface CommitPlan {
  graphId: string;
  operationId: string;
  actorType: "user" | "agent";
  actorId: string;
  sessionId: string | null;
  operations: GraphOperation[];
  insertNodes: CommitNodeInsert[];
  updateNodes: CommitNodeUpdate[];
  deleteNodes: CommitNodeDelete[];
  insertEdges: CommitEdgeInsert[];
  updateEdges: CommitEdgeUpdate[];
  deleteEdges: CommitEdgeDelete[];
}

// --- zod schemas (shared by router input validation and service node validation) ---

const positionSchema = z.object({ x: z.number(), y: z.number() });

const questionNodeDataSchema = z.object({
  kind: z.literal("question"),
  prompt: z.string().min(1),
  intent: z.string().optional(),
});
const findingNodeDataSchema = z.object({
  kind: z.literal("finding"),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  status: z.enum(["open", "confirmed", "rejected"]).optional(),
});
const issueNodeDataSchema = z.object({
  kind: z.literal("issue"),
  issueId: z.string().uuid(),
});
const eventNodeDataSchema = z.object({
  kind: z.literal("event"),
  eventId: z.string().min(1),
});
const replayNodeDataSchema = z.object({
  kind: z.literal("replay"),
  replayId: z.string().min(1),
});
const codeNodeDataSchema = z.object({
  kind: z.literal("code"),
  path: z.string().min(1),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  language: z.string().optional(),
  snippet: z.string().optional(),
});
const documentNodeDataSchema = z.object({
  kind: z.literal("document"),
  title: z.string().min(1),
  path: z.string().optional(),
  excerpt: z.string().optional(),
});

export const nodeDataSchema = z.discriminatedUnion("kind", [
  questionNodeDataSchema,
  findingNodeDataSchema,
  issueNodeDataSchema,
  eventNodeDataSchema,
  replayNodeDataSchema,
  codeNodeDataSchema,
  documentNodeDataSchema,
]);

const createNodeSchema = z.object({
  op: z.literal("createNode"),
  id: z.string().min(1),
  type: z.enum(GRAPH_NODE_TYPES),
  position: positionSchema,
  data: nodeDataSchema,
});
const updateNodeSchema = z.object({
  op: z.literal("updateNode"),
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
  position: positionSchema.optional(),
});
const deleteNodeSchema = z.object({ op: z.literal("deleteNode"), id: z.string().min(1) });
const moveNodesSchema = z.object({
  op: z.literal("moveNodes"),
  positions: z.array(z.object({ id: z.string().min(1), position: positionSchema })).min(1),
});
const createEdgeSchema = z.object({
  op: z.literal("createEdge"),
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  relation: z.enum(GRAPH_RELATIONSHIPS),
});
const updateEdgeSchema = z.object({
  op: z.literal("updateEdge"),
  id: z.string().min(1),
  relation: z.enum(GRAPH_RELATIONSHIPS).optional(),
});
const deleteEdgeSchema = z.object({ op: z.literal("deleteEdge"), id: z.string().min(1) });

export const graphOperationSchema = z.discriminatedUnion("op", [
  createNodeSchema,
  updateNodeSchema,
  deleteNodeSchema,
  moveNodesSchema,
  createEdgeSchema,
  updateEdgeSchema,
  deleteEdgeSchema,
]);

export const applyOperationsInputSchema = z.object({
  operationId: z.string().uuid(),
  graphId: z.string().uuid(),
  baseVersion: z.number().int().min(0),
  actor: z.object({
    type: z.enum(["user", "agent"]),
    sessionId: z.string().optional(),
  }),
  operations: z.array(graphOperationSchema).min(1),
});
