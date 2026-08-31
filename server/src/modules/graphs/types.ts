import { z } from "zod";

export const GRAPH_NODE_TYPES = [
  "question",
  "finding",
  "issue",
  "event",
  "replay",
  "code",
  "document",
  "youtube",
  "browser",
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
  symbolName?: string;
  symbolType?: "function" | "component" | "method" | "hook" | "class" | string;
  focusRange?: {
    startLine: number;
    endLine: number;
    severity?: "error" | "warning" | "info";
  };
  enclosingRange?: {
    startLine: number;
    endLine: number;
  };
}
export interface DocumentNodeData {
  kind: "document";
  title: string;
  path?: string;
  excerpt?: string;
}
export interface YoutubeBookmark {
  id: string;
  time: number;
  label: string;
  description?: string;
}
export interface YoutubeNodeData {
  kind: "youtube";
  url: string;
  videoId?: string;
  title?: string;
  authorName?: string;
  thumbnailUrl?: string;
  duration?: number;
  startTime?: number;
  endTime?: number;
  bookmarks?: YoutubeBookmark[];
  transcriptExcerpt?: string;
}

export type BrowserProvider = "generic-web" | "feishu-doc" | "confluence";

export type BrowserLocator =
  | { type: "feishu-block"; documentId: string; blockId: string }
  | { type: "confluence-content"; pageId: string; localId?: string }
  | { type: "provider-element"; provider: BrowserProvider; role: string }
  | { type: "text-quote"; exact: string; prefix?: string; suffix?: string }
  | { type: "heading-path"; headings: string[]; occurrence?: number }
  | { type: "text-position"; start: number; end: number; contentHash?: string }
  | { type: "dom-path"; xpath: string; startOffset?: number; endOffset?: number }
  | { type: "css-selector"; selector: string };

export interface BrowserResolution {
  state: "resolved" | "unresolved" | "stale";
  locatorType?: string;
  checkedAt?: string;
  reason?: string;
}

export interface BrowserAnchor {
  id: string;
  label: string;
  quote?: string;
  locators?: BrowserLocator[];
  createdBy?: "user" | "agent";
  createdAt?: string;
  updatedAt?: string;
  lastResolution?: BrowserResolution;
}

export interface ProjectionRule {
  id: string;
  operation?: "hide" | "collapse" | "focus";
  name?: string;
  target?: {
    locators?: BrowserLocator[];
    selector?: string;
    xpath?: string;
    elementRole?: string;
  };
  enabled?: boolean;
  origin?: "user" | "agent" | "provider-preset";
  createdAt?: string;
  updatedAt?: string;
  lastResolution?: BrowserResolution;
}

export interface BrowserProjection {
  providerPresetVersion?: string;
  rules?: ProjectionRule[];
}

export interface BrowserViewState {
  focusedAnchorId?: string;
  scrollAnchorId?: string;
  scrollTop?: number;
  lastOpenedAt?: string;
}

export interface BrowserSource {
  provider: BrowserProvider;
  url: string;
  canonicalUrl?: string;
  title?: string;
  siteName?: string;
  documentId?: string;
  profileId?: string;
}

export interface BrowserPreview {
  title?: string;
  excerpt?: string;
  faviconUrl?: string;
  capturedAt?: string;
  contentHash?: string;
  snapshotObjectKey?: string;
}

export interface BrowserNodeData {
  kind: "browser";
  schemaVersion?: number;
  source: BrowserSource;
  preview?: BrowserPreview;
  anchors?: BrowserAnchor[];
  projection?: BrowserProjection;
  viewState?: BrowserViewState;
}

export type GraphNodeData =
  | QuestionNodeData
  | FindingNodeData
  | IssueNodeData
  | EventNodeData
  | ReplayNodeData
  | CodeNodeData
  | DocumentNodeData
  | YoutubeNodeData
  | BrowserNodeData;

export interface GraphEdgeData {
  relation: GraphRelationship;
  sourceAnchorId?: string;
  targetAnchorId?: string;
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
      sourceAnchorId?: string;
      targetAnchorId?: string;
    }
  | {
      op: "updateEdge";
      id: string;
      relation?: GraphRelationship;
      sourceAnchorId?: string;
      targetAnchorId?: string;
    }
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
  data?: GraphEdgeData;
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
  sourceAnchorId?: string;
  targetAnchorId?: string;
}
export interface CommitEdgeUpdate {
  id: string;
  relation?: GraphRelationship;
  sourceAnchorId?: string;
  targetAnchorId?: string;
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
  symbolName: z.string().optional(),
  symbolType: z.string().optional(),
  focusRange: z
    .object({
      startLine: z.number().int().min(1),
      endLine: z.number().int().min(1),
      severity: z.enum(["error", "warning", "info"]).optional(),
    })
    .optional(),
  enclosingRange: z
    .object({
      startLine: z.number().int().min(1),
      endLine: z.number().int().min(1),
    })
    .optional(),
});
const documentNodeDataSchema = z.object({
  kind: z.literal("document"),
  title: z.string().min(1),
  path: z.string().optional(),
  excerpt: z.string().optional(),
});
const youtubeBookmarkSchema = z.object({
  id: z.string().min(1),
  time: z.number().min(0),
  label: z.string().min(1),
  description: z.string().optional(),
});
const youtubeNodeDataSchema = z.object({
  kind: z.literal("youtube"),
  url: z.string().min(1),
  videoId: z.string().optional(),
  title: z.string().optional(),
  authorName: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  duration: z.number().min(0).optional(),
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  bookmarks: z.array(youtubeBookmarkSchema).optional(),
  transcriptExcerpt: z.string().optional(),
});

const browserLocatorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("feishu-block"), documentId: z.string(), blockId: z.string() }),
  z.object({
    type: z.literal("confluence-content"),
    pageId: z.string(),
    localId: z.string().optional(),
  }),
  z.object({
    type: z.literal("provider-element"),
    provider: z.enum(["generic-web", "feishu-doc", "confluence"]),
    role: z.string(),
  }),
  z.object({
    type: z.literal("text-quote"),
    exact: z.string(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
  }),
  z.object({
    type: z.literal("heading-path"),
    headings: z.array(z.string()),
    occurrence: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("text-position"),
    start: z.number().int(),
    end: z.number().int(),
    contentHash: z.string().optional(),
  }),
  z.object({
    type: z.literal("dom-path"),
    xpath: z.string(),
    startOffset: z.number().int().optional(),
    endOffset: z.number().int().optional(),
  }),
  z.object({ type: z.literal("css-selector"), selector: z.string() }),
]);

const browserResolutionSchema = z.object({
  state: z.enum(["resolved", "unresolved", "stale"]),
  locatorType: z.string().optional(),
  checkedAt: z.string().optional(),
  reason: z.string().optional(),
});

const browserAnchorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  quote: z.string().optional(),
  locators: z.array(browserLocatorSchema).optional(),
  createdBy: z.enum(["user", "agent"]).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastResolution: browserResolutionSchema.optional(),
});

const projectionRuleSchema = z.object({
  id: z.string().min(1),
  operation: z.enum(["hide", "collapse", "focus"]).optional(),
  name: z.string().optional(),
  target: z
    .object({
      locators: z.array(browserLocatorSchema).optional(),
      selector: z.string().optional(),
      xpath: z.string().optional(),
      elementRole: z.string().optional(),
    })
    .optional(),
  enabled: z.boolean().optional(),
  origin: z.enum(["user", "agent", "provider-preset"]).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastResolution: browserResolutionSchema.optional(),
});

const browserProjectionSchema = z.object({
  providerPresetVersion: z.string().optional(),
  rules: z.array(projectionRuleSchema).optional(),
});

const browserViewStateSchema = z.object({
  focusedAnchorId: z.string().optional(),
  scrollAnchorId: z.string().optional(),
  scrollTop: z.number().optional(),
  lastOpenedAt: z.string().optional(),
});

const browserSourceSchema = z.object({
  provider: z.enum(["generic-web", "feishu-doc", "confluence"]),
  url: z.string().min(1),
  canonicalUrl: z.string().optional(),
  title: z.string().optional(),
  siteName: z.string().optional(),
  documentId: z.string().optional(),
  profileId: z.string().optional(),
});

const browserPreviewSchema = z.object({
  title: z.string().optional(),
  excerpt: z.string().optional(),
  faviconUrl: z.string().optional(),
  capturedAt: z.string().optional(),
  contentHash: z.string().optional(),
  snapshotObjectKey: z.string().optional(),
});

const browserNodeDataSchema = z.object({
  kind: z.literal("browser"),
  schemaVersion: z.number().int().optional(),
  source: browserSourceSchema,
  preview: browserPreviewSchema.optional(),
  anchors: z.array(browserAnchorSchema).optional(),
  projection: browserProjectionSchema.optional(),
  viewState: browserViewStateSchema.optional(),
});

export const nodeDataSchema = z.discriminatedUnion("kind", [
  questionNodeDataSchema,
  findingNodeDataSchema,
  issueNodeDataSchema,
  eventNodeDataSchema,
  replayNodeDataSchema,
  codeNodeDataSchema,
  documentNodeDataSchema,
  youtubeNodeDataSchema,
  browserNodeDataSchema,
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
  sourceAnchorId: z.string().optional(),
  targetAnchorId: z.string().optional(),
});
const updateEdgeSchema = z.object({
  op: z.literal("updateEdge"),
  id: z.string().min(1),
  relation: z.enum(GRAPH_RELATIONSHIPS).optional(),
  sourceAnchorId: z.string().optional(),
  targetAnchorId: z.string().optional(),
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
