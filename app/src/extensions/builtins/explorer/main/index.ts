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
  EXPLORER_GRAPH_CREATED_BLOCK_TYPE,
} from "../common/types.js";

const client = createMainTrpcClient();

export default defineMainExtension({
  ...EXPLORER_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({
      id: "explorer.prompt",
      content: `Explorer Graph tools are explicit-context tools. Only use them after the user confirms the Project, target, intent, and evidence scope for /explorer-graph-create. Always pass projectId and graphId explicitly; never infer them from the current route or desktop context. Create the graph first, then create nodes and connect them. The first four steps are context gathering, AskUserQuestion confirmation, read-only preview, and final creation confirmation. Do not write graph data before final confirmation. Available tools: ${EXPLORER_CREATE_GRAPH_TOOL}, ${EXPLORER_CREATE_QUESTION_TOOL}, ${EXPLORER_CREATE_FINDING_TOOL}, ${EXPLORER_CREATE_ISSUE_TOOL}, ${EXPLORER_CREATE_EVENT_TOOL}, ${EXPLORER_CREATE_REPLAY_TOOL}, ${EXPLORER_CREATE_CODE_TOOL}, ${EXPLORER_CREATE_DOCUMENT_TOOL}, ${EXPLORER_CONNECT_NODES_TOOL}, ${EXPLORER_DELETE_NODE_TOOL}, ${EXPLORER_DELETE_EDGE_TOOL}.`,
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
