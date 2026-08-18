import { randomUUID } from "node:crypto";

import { Type } from "@earendil-works/pi-ai";

import { createMainTrpcClient } from "../../../../main/trpc/client.js";
import { defineMainExtension, type MainExtensionContext } from "../../../core/main/index.js";
import { EXPLORER_EXTENSION } from "../common/extension.js";
import {
  EXPLORER_CONNECT_NODES_TOOL,
  EXPLORER_CREATE_CODE_TOOL,
  EXPLORER_CREATE_DOCUMENT_TOOL,
  EXPLORER_CREATE_EVENT_TOOL,
  EXPLORER_CREATE_FINDING_TOOL,
  EXPLORER_CREATE_GRAPH_TOOL,
  EXPLORER_CREATE_ISSUE_TOOL,
  EXPLORER_CREATE_QUESTION_TOOL,
  EXPLORER_CREATE_REPLAY_TOOL,
  EXPLORER_DELETE_EDGE_TOOL,
  EXPLORER_DELETE_NODE_TOOL,
  EXPLORER_GET_NODE_TOOL,
  EXPLORER_GRAPH_CREATED_BLOCK_TYPE,
  EXPLORER_GRAPH_LIST_BLOCK_TYPE,
  EXPLORER_LIST_GRAPHS_TOOL,
  EXPLORER_LIST_NODES_TOOL,
  EXPLORER_NODE_LIST_BLOCK_TYPE,
} from "../common/types.js";

const client = createMainTrpcClient();

export default defineMainExtension({
  ...EXPLORER_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({
      id: "explorer.prompt",
      content: `Explorer Graph tools are explicit-context tools. Only use them after the user confirms the Project, target, intent, and evidence scope for /explorer-graph-create. Always pass projectId and graphId explicitly; never infer them from the current route or desktop context. Create the graph first, then create nodes and connect them. The first four steps are context gathering, AskUserQuestion confirmation, read-only preview, and final creation confirmation. Do not write graph data before final confirmation. Use ${EXPLORER_LIST_GRAPHS_TOOL}, ${EXPLORER_LIST_NODES_TOOL}, and ${EXPLORER_GET_NODE_TOOL} to discover existing graphs and node IDs before creating duplicates or connecting nodes — reuse existing nodes instead of recreating them. Available tools: ${EXPLORER_CREATE_GRAPH_TOOL}, ${EXPLORER_CREATE_QUESTION_TOOL}, ${EXPLORER_CREATE_FINDING_TOOL}, ${EXPLORER_CREATE_ISSUE_TOOL}, ${EXPLORER_CREATE_EVENT_TOOL}, ${EXPLORER_CREATE_REPLAY_TOOL}, ${EXPLORER_CREATE_CODE_TOOL}, ${EXPLORER_CREATE_DOCUMENT_TOOL}, ${EXPLORER_CONNECT_NODES_TOOL}, ${EXPLORER_DELETE_NODE_TOOL}, ${EXPLORER_DELETE_EDGE_TOOL}, ${EXPLORER_LIST_GRAPHS_TOOL}, ${EXPLORER_LIST_NODES_TOOL}, ${EXPLORER_GET_NODE_TOOL}.`,
    });

    ctx.tools.register({
      name: EXPLORER_CREATE_GRAPH_TOOL,
      label: "Create Explorer Graph",
      description: "Create an empty Explorer evidence graph after user confirmation.",
      executionMode: "sequential",
      parameters: Type.Object({
        projectId: Type.String({ description: "Confirmed project ID." }),
        title: Type.String({ description: "Graph title." }),
      }),
      async execute(_toolCallId, args) {
        const graph = await client.graphs.create.mutate({
          projectId: args.projectId,
          title: args.title,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Created Explorer Graph ${graph.title} (${graph.id}) at version ${graph.version}.`,
            },
          ],
          details: {
            type: "explorer.graph.created",
            assistantBlock: {
              type: EXPLORER_GRAPH_CREATED_BLOCK_TYPE,
              props: {
                projectId: graph.projectId,
                graphId: graph.id,
                title: graph.title,
                version: graph.version,
                nodeCount: 0,
                edgeCount: 0,
              },
            },
          },
        };
      },
    });

    ctx.tools.register(
      createNodeTool(
        EXPLORER_CREATE_QUESTION_TOOL,
        "Create Question Node",
        Type.Object({
          projectId: Type.String(),
          graphId: Type.String(),
          prompt: Type.String(),
          intent: Type.Optional(Type.String()),
          x: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
        }),
        (args) => ({
          kind: "question",
          prompt: args.prompt,
          ...(args.intent ? { intent: args.intent } : {}),
        }),
        ctx,
      ),
    );
    ctx.tools.register(
      createNodeTool(
        EXPLORER_CREATE_FINDING_TOOL,
        "Create Finding Node",
        Type.Object({
          projectId: Type.String(),
          graphId: Type.String(),
          summary: Type.String(),
          confidence: Type.Optional(Type.Number()),
          status: Type.Optional(Type.String()),
          x: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
        }),
        (args) => ({
          kind: "finding",
          summary: args.summary,
          ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
          ...(args.status ? { status: args.status as "open" | "confirmed" | "rejected" } : {}),
        }),
        ctx,
      ),
    );
    ctx.tools.register(
      createNodeTool(
        EXPLORER_CREATE_ISSUE_TOOL,
        "Create Issue Node",
        Type.Object({
          projectId: Type.String(),
          graphId: Type.String(),
          issueId: Type.String(),
          x: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
        }),
        (args) => ({ kind: "issue", issueId: args.issueId }),
        ctx,
      ),
    );
    ctx.tools.register(
      createNodeTool(
        EXPLORER_CREATE_EVENT_TOOL,
        "Create Event Node",
        Type.Object({
          projectId: Type.String(),
          graphId: Type.String(),
          eventId: Type.String(),
          x: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
        }),
        (args) => ({ kind: "event", eventId: args.eventId }),
        ctx,
      ),
    );
    ctx.tools.register(
      createNodeTool(
        EXPLORER_CREATE_REPLAY_TOOL,
        "Create Replay Node",
        Type.Object({
          projectId: Type.String(),
          graphId: Type.String(),
          replayId: Type.String(),
          x: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
        }),
        (args) => ({ kind: "replay", replayId: args.replayId }),
        ctx,
      ),
    );
    ctx.tools.register(
      createNodeTool(
        EXPLORER_CREATE_CODE_TOOL,
        "Create Code Node",
        Type.Object({
          projectId: Type.String(),
          graphId: Type.String(),
          path: Type.String(),
          startLine: Type.Optional(Type.Number()),
          endLine: Type.Optional(Type.Number()),
          language: Type.Optional(Type.String()),
          snippet: Type.Optional(Type.String()),
          x: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
        }),
        (args) => ({
          kind: "code",
          path: args.path,
          ...(args.startLine !== undefined ? { startLine: args.startLine } : {}),
          ...(args.endLine !== undefined ? { endLine: args.endLine } : {}),
          ...(args.language ? { language: args.language } : {}),
          ...(args.snippet ? { snippet: args.snippet } : {}),
        }),
        ctx,
      ),
    );
    ctx.tools.register(
      createNodeTool(
        EXPLORER_CREATE_DOCUMENT_TOOL,
        "Create Document Node",
        Type.Object({
          projectId: Type.String(),
          graphId: Type.String(),
          title: Type.String(),
          path: Type.Optional(Type.String()),
          excerpt: Type.Optional(Type.String()),
          x: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
        }),
        (args) => ({
          kind: "document",
          title: args.title,
          ...(args.path ? { path: args.path } : {}),
          ...(args.excerpt ? { excerpt: args.excerpt } : {}),
        }),
        ctx,
      ),
    );

    ctx.tools.register({
      name: EXPLORER_CONNECT_NODES_TOOL,
      label: "Connect Explorer Nodes",
      description: "Create a relationship between two explicit graph nodes.",
      executionMode: "sequential",
      parameters: Type.Object({
        projectId: Type.String(),
        graphId: Type.String(),
        source: Type.String(),
        target: Type.String(),
        relation: Type.String(),
        sourceHandle: Type.Optional(Type.String()),
        targetHandle: Type.Optional(Type.String()),
      }),
      async execute(_toolCallId, args) {
        const result = await apply(ctx, {
          projectId: args.projectId,
          graphId: args.graphId,
          op: "createEdge",
          id: `tmp_${randomUUID()}`,
          source: args.source,
          target: args.target,
          relation: args.relation as never,
          sourceHandle: args.sourceHandle ?? null,
          targetHandle: args.targetHandle ?? null,
        });
        return resultText("Connected nodes", result);
      },
    });

    ctx.tools.register({
      name: EXPLORER_DELETE_NODE_TOOL,
      label: "Delete Explorer Node",
      description: "Delete one explicit graph node and its connected edges.",
      executionMode: "sequential",
      parameters: Type.Object({
        projectId: Type.String(),
        graphId: Type.String(),
        nodeId: Type.String(),
      }),
      async execute(_toolCallId, args) {
        const result = await apply(ctx, {
          projectId: args.projectId,
          graphId: args.graphId,
          op: "deleteNode",
          id: args.nodeId,
        });
        return resultText("Deleted node", result);
      },
    });

    ctx.tools.register({
      name: EXPLORER_DELETE_EDGE_TOOL,
      label: "Delete Explorer Edge",
      description: "Delete one explicit graph relationship.",
      executionMode: "sequential",
      parameters: Type.Object({
        projectId: Type.String(),
        graphId: Type.String(),
        edgeId: Type.String(),
      }),
      async execute(_toolCallId, args) {
        const result = await apply(ctx, {
          projectId: args.projectId,
          graphId: args.graphId,
          op: "deleteEdge",
          id: args.edgeId,
        });
        return resultText("Deleted relationship", result);
      },
    });

    ctx.tools.register({
      name: EXPLORER_LIST_GRAPHS_TOOL,
      label: "List Explorer Graphs",
      description:
        "List every Explorer evidence graph in a project with node and edge counts, so the agent can discover graph IDs without asking.",
      executionMode: "sequential",
      parameters: Type.Object({
        projectId: Type.String({ description: "Confirmed project ID." }),
      }),
      async execute(_toolCallId, args) {
        const graphs = await client.graphs.list.query({ projectId: args.projectId });
        const rows = graphs.map((graph) => ({
          id: graph.id,
          title: graph.title,
          status: graph.status,
          version: graph.version,
          nodeCount: graph.nodeCount,
          edgeCount: graph.edgeCount,
          createdAt: graph.createdAt,
          updatedAt: graph.updatedAt,
        }));
        const text = rows.length
          ? `${rows.length} Explorer Graph(s) in project ${args.projectId}:\n${rows
              .map(
                (graph) =>
                  `- ${graph.title} (${graph.id})\n  ${graph.nodeCount} nodes · ${graph.edgeCount} edges · version ${graph.version} · ${graph.status}`,
              )
              .join("\n")}\n\n${JSON.stringify({ graphs: rows }, null, 2)}`
          : `No Explorer Graphs found in project ${args.projectId}.`;
        return {
          content: [{ type: "text" as const, text }],
          details: {
            type: "explorer.graph.list",
            assistantBlock: {
              type: EXPLORER_GRAPH_LIST_BLOCK_TYPE,
              props: {
                projectId: args.projectId,
                graphs: rows.map(({ id, title, status, version, nodeCount, edgeCount }) => ({
                  id,
                  title,
                  status,
                  version,
                  nodeCount,
                  edgeCount,
                })),
              },
            },
          },
        };
      },
    });

    ctx.tools.register({
      name: EXPLORER_LIST_NODES_TOOL,
      label: "List Explorer Nodes",
      description:
        "List the nodes in an Explorer graph, optionally filtered by node type and fuzzy search over label/id, so the agent can find node IDs to connect or dedupe.",
      executionMode: "sequential",
      parameters: Type.Object({
        projectId: Type.String({ description: "Confirmed project ID." }),
        graphId: Type.String({ description: "Confirmed graph ID." }),
        type: Type.Optional(
          Type.Union([
            Type.Literal("question"),
            Type.Literal("finding"),
            Type.Literal("issue"),
            Type.Literal("event"),
            Type.Literal("replay"),
            Type.Literal("code"),
            Type.Literal("document"),
          ]),
        ),
        search: Type.Optional(
          Type.String({ description: "Case-insensitive fuzzy match against node label or id." }),
        ),
      }),
      async execute(_toolCallId, args) {
        const snapshot = await getSnapshot(args.projectId, args.graphId);
        const search = args.search?.trim().toLowerCase();
        const nodes = snapshot.nodes.filter((node) => {
          if (args.type && node.type !== args.type) return false;
          if (search && !nodeSearchText(node).includes(search)) return false;
          return true;
        });
        const rows = nodes.map(serializeNode);
        const text = rows.length
          ? `${rows.length} node(s) in graph ${snapshot.title}:\n${JSON.stringify(
              { nodes: rows },
              null,
              2,
            )}`
          : `No nodes matched in graph ${snapshot.title}.`;
        return {
          content: [{ type: "text" as const, text }],
          details: {
            type: "explorer.graph.nodes",
            assistantBlock: {
              type: EXPLORER_NODE_LIST_BLOCK_TYPE,
              props: {
                projectId: args.projectId,
                graphId: args.graphId,
                title: snapshot.title,
                nodes: rows.map(({ id, type, label }) => ({ id, type, label })),
              },
            },
          },
        };
      },
    });

    ctx.tools.register({
      name: EXPLORER_GET_NODE_TOOL,
      label: "Get Explorer Node",
      description:
        "Get one Explorer node's full data and its connected edges, for auditing or before updating/deleting it.",
      executionMode: "sequential",
      parameters: Type.Object({
        projectId: Type.String({ description: "Confirmed project ID." }),
        graphId: Type.String({ description: "Confirmed graph ID." }),
        nodeId: Type.String({ description: "Confirmed node ID." }),
      }),
      async execute(_toolCallId, args) {
        const snapshot = await getSnapshot(args.projectId, args.graphId);
        const node = snapshot.nodes.find((candidate) => candidate.id === args.nodeId);
        if (!node) throw new Error(`Node ${args.nodeId} not found in graph ${snapshot.title}.`);
        const edges = snapshot.edges
          .filter((edge) => edge.source === args.nodeId || edge.target === args.nodeId)
          .map((edge) => ({
            id: edge.id,
            relation: edge.data.relation,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? null,
            targetHandle: edge.targetHandle ?? null,
          }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ node: serializeNode(node), edges }, null, 2),
            },
          ],
          details: { type: "explorer.graph.node" },
        };
      },
    });
  },
});

function createNodeTool(
  name: string,
  label: string,
  parameters: ReturnType<typeof Type.Object>,
  data: (args: any) => Record<string, unknown>,
  ctx: MainExtensionContext,
) {
  return {
    name,
    label,
    description: "Create a typed Explorer node with explicit project and graph IDs.",
    executionMode: "sequential" as const,
    parameters,
    async execute(_toolCallId: string, args: any) {
      const result = await apply(ctx, {
        projectId: args.projectId,
        graphId: args.graphId,
        op: "createNode",
        id: `tmp_${randomUUID()}`,
        type: data(args).kind,
        position: { x: args.x ?? 80, y: args.y ?? 80 },
        data: data(args),
      });
      return resultText(`Created ${data(args).kind} node`, result);
    },
  };
}

async function apply(ctx: any, operation: any) {
  const snapshot = await client.graphs.get.query({
    projectId: operation.projectId,
    graphId: operation.graphId,
  });
  if (!snapshot) throw new Error("Explorer Graph not found in the confirmed project.");
  const { projectId, graphId, ...graphOperation } = operation;
  const sessionId = ctx.extensionRuntime.getCurrentAgentContext()?.sessionId;
  return client.graphs.applyOperations.mutate({
    projectId,
    graphId,
    operationId: randomUUID(),
    baseVersion: snapshot.version,
    actor: { type: "agent", ...(sessionId ? { sessionId } : {}) },
    operations: [graphOperation],
  });
}

function resultText(
  label: string,
  result: { version: number; applied: Array<{ nodeId?: string; edgeId?: string }> },
) {
  const ids = result.applied
    .flatMap((item) => [item.nodeId, item.edgeId])
    .filter(Boolean)
    .join(", ");
  return {
    content: [
      {
        type: "text" as const,
        text: `${label}. Graph version ${result.version}.${ids ? ` Persisted IDs: ${ids}` : ""}`,
      },
    ],
    details: { type: "explorer.graph.operation", version: result.version },
  };
}

async function getSnapshot(projectId: string, graphId: string) {
  const snapshot = await client.graphs.get.query({ projectId, graphId });
  if (!snapshot) throw new Error("Explorer Graph not found in the confirmed project.");
  return snapshot;
}

function nodeLabel(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case "question":
      return typeof data.prompt === "string" ? data.prompt : "";
    case "finding":
      return typeof data.summary === "string" ? data.summary : "";
    case "document":
      return typeof data.title === "string" ? data.title : "";
    case "code":
      return typeof data.path === "string" ? data.path : "";
    case "issue":
      return typeof data.issueId === "string" ? data.issueId : "";
    case "event":
      return typeof data.eventId === "string" ? data.eventId : "";
    case "replay":
      return typeof data.replayId === "string" ? data.replayId : "";
    default:
      return "";
  }
}

function serializeNode(node: unknown) {
  const candidate = node as {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  };
  return {
    id: candidate.id,
    type: candidate.type,
    label: nodeLabel(candidate.type, candidate.data),
    x: candidate.position.x,
    y: candidate.position.y,
    data: candidate.data,
  };
}

function nodeSearchText(node: unknown): string {
  const candidate = node as {
    id: string;
    type: string;
    data: Record<string, unknown>;
  };
  return `${candidate.id} ${nodeLabel(candidate.type, candidate.data)} ${JSON.stringify(candidate.data)}`.toLowerCase();
}
