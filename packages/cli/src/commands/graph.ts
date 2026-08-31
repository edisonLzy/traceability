import { randomUUID } from "node:crypto";

import { Command } from "commander";

import { printJson, printTable } from "../lib/output.js";
import { getTrpcClient } from "../lib/trpc.js";

// ─── option interfaces ────────────────────────────────────────────────────────

interface GraphListOptions {
  projectId: string;
  json?: boolean;
}

interface GraphShowOptions {
  projectId: string;
  json?: boolean;
}

interface GraphCreateOptions {
  projectId: string;
  title: string;
  json?: boolean;
}

interface GraphRenameOptions {
  projectId: string;
  title: string;
  json?: boolean;
}

interface GraphArchiveOptions {
  projectId: string;
  json?: boolean;
}

interface NodeListOptions {
  projectId: string;
  type?: string;
  json?: boolean;
}

interface NodeShowOptions {
  projectId: string;
  json?: boolean;
}

interface NodeAddOptions {
  projectId: string;
  type: string;
  // question
  prompt?: string;
  intent?: string;
  // finding
  summary?: string;
  confidence?: string;
  status?: string;
  // issue
  issueId?: string;
  // event
  eventId?: string;
  // replay
  replayId?: string;
  // code
  path?: string;
  startLine?: string;
  endLine?: string;
  language?: string;
  snippet?: string;
  // document (--doc-title avoids collision with graph --title)
  docTitle?: string;
  excerpt?: string;
  // youtube
  url?: string;
  videoTitle?: string;
  videoId?: string;
  duration?: string;
  startTime?: string;
  endTime?: string;
  transcript?: string;
  json?: boolean;
}

interface NodeRemoveOptions {
  projectId: string;
}

interface EdgeAddOptions {
  projectId: string;
  source: string;
  target: string;
  relation: string;
  json?: boolean;
}

interface EdgeRemoveOptions {
  projectId: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

type TrpcClient = Awaited<ReturnType<typeof getTrpcClient>>;

/** Fetch the current graph version, apply one operation, and return the result. */
async function applyOp(
  client: TrpcClient,
  projectId: string,
  graphId: string,
  operation: Record<string, unknown>,
) {
  const snapshot = await client.graphs.get.query({ projectId, graphId });
  if (!snapshot) throw new Error(`Graph not found: ${graphId}`);
  return client.graphs.applyOperations.mutate({
    projectId,
    graphId,
    operationId: randomUUID(),
    baseVersion: snapshot.version,
    actor: { type: "user" },
    operations: [operation as never],
  });
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
    case "youtube":
      return typeof data.title === "string"
        ? data.title
        : typeof data.url === "string"
          ? data.url
          : "";
    default:
      return "";
  }
}

function buildNodeData(opts: NodeAddOptions): Record<string, unknown> {
  switch (opts.type) {
    case "question": {
      if (!opts.prompt) throw new Error("--prompt is required for --type question");
      return {
        kind: "question",
        prompt: opts.prompt,
        ...(opts.intent ? { intent: opts.intent } : {}),
      };
    }
    case "finding": {
      if (!opts.summary) throw new Error("--summary is required for --type finding");
      const confidence = opts.confidence !== undefined ? Number(opts.confidence) : undefined;
      if (
        confidence !== undefined &&
        (Number.isNaN(confidence) || confidence < 0 || confidence > 1)
      ) {
        throw new Error("--confidence must be a number between 0 and 1");
      }
      if (opts.status !== undefined && !["open", "confirmed", "rejected"].includes(opts.status)) {
        throw new Error("--status must be one of: open, confirmed, rejected");
      }
      return {
        kind: "finding",
        summary: opts.summary,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      };
    }
    case "issue": {
      if (!opts.issueId) throw new Error("--issue-id is required for --type issue");
      return { kind: "issue", issueId: opts.issueId };
    }
    case "event": {
      if (!opts.eventId) throw new Error("--event-id is required for --type event");
      return { kind: "event", eventId: opts.eventId };
    }
    case "replay": {
      if (!opts.replayId) throw new Error("--replay-id is required for --type replay");
      return { kind: "replay", replayId: opts.replayId };
    }
    case "code": {
      if (!opts.path) throw new Error("--path is required for --type code");
      return {
        kind: "code",
        path: opts.path,
        ...(opts.startLine !== undefined ? { startLine: Number(opts.startLine) } : {}),
        ...(opts.endLine !== undefined ? { endLine: Number(opts.endLine) } : {}),
        ...(opts.language ? { language: opts.language } : {}),
        ...(opts.snippet ? { snippet: opts.snippet } : {}),
      };
    }
    case "document": {
      if (!opts.docTitle) throw new Error("--doc-title is required for --type document");
      return {
        kind: "document",
        title: opts.docTitle,
        ...(opts.path ? { path: opts.path } : {}),
        ...(opts.excerpt ? { excerpt: opts.excerpt } : {}),
      };
    }
    case "youtube": {
      if (!opts.url) throw new Error("--url is required for --type youtube");
      const duration = opts.duration !== undefined ? Number(opts.duration) : undefined;
      const startTime = opts.startTime !== undefined ? Number(opts.startTime) : undefined;
      const endTime = opts.endTime !== undefined ? Number(opts.endTime) : undefined;
      return {
        kind: "youtube",
        url: opts.url,
        ...(opts.videoTitle ? { title: opts.videoTitle } : {}),
        ...(opts.videoId ? { videoId: opts.videoId } : {}),
        ...(duration !== undefined ? { duration } : {}),
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(opts.transcript ? { transcriptExcerpt: opts.transcript } : {}),
      };
    }
    default:
      throw new Error(
        `Unknown --type "${opts.type}". Must be one of: question, finding, issue, event, replay, code, document, youtube`,
      );
  }
}

const VALID_RELATIONS = [
  "investigates",
  "supports",
  "contradicts",
  "caused_by",
  "implemented_by",
  "observed_in",
  "related_to",
] as const;

// ─── command registration ─────────────────────────────────────────────────────

export function graphCommand(program: Command): void {
  const cmd = program.command("graph").description("manage Explorer evidence graphs");

  // ── graph list ──────────────────────────────────────────────────────────────
  cmd
    .command("list")
    .description("list all graphs in a project")
    .requiredOption("--project-id <id>", "project ID")
    .option("--json", "output JSON")
    .action(async (opts: GraphListOptions) => {
      const client = await getTrpcClient();
      const graphs = await client.graphs.list.query({ projectId: opts.projectId });
      if (opts.json) {
        printJson(graphs);
      } else {
        printTable(graphs, [
          { key: "id", label: "ID", width: 36 },
          { key: "title", label: "TITLE", width: 32 },
          { key: "status", label: "STATUS", width: 10 },
          { key: "nodeCount", label: "NODES", width: 6 },
          { key: "edgeCount", label: "EDGES", width: 6 },
          { key: "updatedAt", label: "UPDATED", width: 28 },
        ]);
      }
    });

  // ── graph show ──────────────────────────────────────────────────────────────
  cmd
    .command("show <graphId>")
    .description("show a graph snapshot with its nodes and edges")
    .requiredOption("--project-id <id>", "project ID")
    .option("--json", "output full snapshot as JSON")
    .action(async (graphId: string, opts: GraphShowOptions) => {
      const client = await getTrpcClient();
      const snapshot = await client.graphs.get.query({
        projectId: opts.projectId,
        graphId,
      });
      if (!snapshot) throw new Error(`Graph not found: ${graphId}`);
      if (opts.json) {
        printJson(snapshot);
      } else {
        console.log(`${snapshot.title} (${snapshot.id})`);
        console.log(
          `Status: ${snapshot.status}  Version: ${snapshot.version}  Updated: ${snapshot.updatedAt}`,
        );
        console.log(`${snapshot.nodes.length} node(s)  ${snapshot.edges.length} edge(s)`);
      }
    });

  // ── graph create ────────────────────────────────────────────────────────────
  cmd
    .command("create")
    .description("create a new empty graph")
    .requiredOption("--project-id <id>", "project ID")
    .requiredOption("--title <title>", "graph title")
    .option("--json", "output JSON")
    .action(async (opts: GraphCreateOptions) => {
      const client = await getTrpcClient();
      const graph = await client.graphs.create.mutate({
        projectId: opts.projectId,
        title: opts.title,
      });
      if (opts.json) printJson(graph);
      else console.log(`Created graph "${graph.title}" (${graph.id})`);
    });

  // ── graph rename ────────────────────────────────────────────────────────────
  cmd
    .command("rename <graphId>")
    .description("rename a graph")
    .requiredOption("--project-id <id>", "project ID")
    .requiredOption("--title <title>", "new title")
    .option("--json", "output JSON")
    .action(async (graphId: string, opts: GraphRenameOptions) => {
      const client = await getTrpcClient();
      const graph = await client.graphs.rename.mutate({
        projectId: opts.projectId,
        graphId,
        title: opts.title,
      });
      if (opts.json) printJson(graph);
      else console.log(`Renamed graph ${graph.id} → "${graph.title}"`);
    });

  // ── graph archive ───────────────────────────────────────────────────────────
  cmd
    .command("archive <graphId>")
    .description("archive a graph")
    .requiredOption("--project-id <id>", "project ID")
    .option("--json", "output JSON")
    .action(async (graphId: string, opts: GraphArchiveOptions) => {
      const client = await getTrpcClient();
      const graph = await client.graphs.archive.mutate({
        projectId: opts.projectId,
        graphId,
      });
      if (opts.json) printJson(graph);
      else console.log(`Archived graph "${graph.title}" (${graph.id})`);
    });

  // ── graph node ─────────────────────────────────────────────────────────────
  const nodeCmd = cmd.command("node").description("manage nodes in an Explorer graph");

  nodeCmd
    .command("list <graphId>")
    .description("list nodes in a graph")
    .requiredOption("--project-id <id>", "project ID")
    .option(
      "--type <kind>",
      "filter by node type: question|finding|issue|event|replay|code|document",
    )
    .option("--json", "output JSON")
    .action(async (graphId: string, opts: NodeListOptions) => {
      const client = await getTrpcClient();
      const snapshot = await client.graphs.get.query({
        projectId: opts.projectId,
        graphId,
      });
      if (!snapshot) throw new Error(`Graph not found: ${graphId}`);
      const nodes = opts.type ? snapshot.nodes.filter((n) => n.type === opts.type) : snapshot.nodes;
      if (opts.json) {
        printJson(nodes);
      } else {
        const rows = nodes.map((n) => ({
          id: n.id,
          type: n.type,
          label: nodeLabel(n.type, n.data as Record<string, unknown>),
        }));
        printTable(rows, [
          { key: "id", label: "ID", width: 36 },
          { key: "type", label: "TYPE", width: 12 },
          { key: "label", label: "LABEL", width: 40 },
        ]);
      }
    });

  nodeCmd
    .command("show <graphId> <nodeId>")
    .description("show a node with its connected edges")
    .requiredOption("--project-id <id>", "project ID")
    .option("--json", "output JSON")
    .action(async (graphId: string, nodeId: string, opts: NodeShowOptions) => {
      const client = await getTrpcClient();
      const snapshot = await client.graphs.get.query({
        projectId: opts.projectId,
        graphId,
      });
      if (!snapshot) throw new Error(`Graph not found: ${graphId}`);
      const node = snapshot.nodes.find((n) => n.id === nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);
      const edges = snapshot.edges.filter((e) => e.source === nodeId || e.target === nodeId);
      printJson({ node, edges });
    });

  nodeCmd
    .command("add <graphId>")
    .description(
      "add a node to a graph (--type question|finding|issue|event|replay|code|document|youtube)",
    )
    .requiredOption("--project-id <id>", "project ID")
    .requiredOption(
      "--type <kind>",
      "node type: question|finding|issue|event|replay|code|document|youtube",
    )
    // question
    .option("--prompt <text>", "(question) question prompt")
    .option("--intent <text>", "(question) investigation intent")
    // finding
    .option("--summary <text>", "(finding) finding summary")
    .option("--confidence <n>", "(finding) confidence 0–1")
    .option("--status <s>", "(finding) open|confirmed|rejected")
    // issue / event / replay refs
    .option("--issue-id <uuid>", "(issue) issue ID")
    .option("--event-id <id>", "(event) event ID")
    .option("--replay-id <id>", "(replay) replay ID")
    // code
    .option("--path <path>", "(code) file path; (document) optional doc path")
    .option("--start-line <n>", "(code) start line")
    .option("--end-line <n>", "(code) end line")
    .option("--language <lang>", "(code) language")
    .option("--snippet <text>", "(code) inline snippet")
    // document
    .option("--doc-title <text>", "(document) document title")
    .option("--excerpt <text>", "(document) document excerpt")
    // youtube
    .option("--url <url>", "(youtube) video URL")
    .option("--video-title <text>", "(youtube) video title")
    .option("--video-id <id>", "(youtube) video ID")
    .option("--duration <seconds>", "(youtube) total duration in seconds")
    .option("--start-time <seconds>", "(youtube) initial start playback time")
    .option("--end-time <seconds>", "(youtube) clip end time")
    .option("--transcript <text>", "(youtube) transcript excerpt")
    .option("--json", "output JSON")
    .action(async (graphId: string, opts: NodeAddOptions) => {
      const data = buildNodeData(opts);
      const tempId = `tmp_${randomUUID()}`;
      const client = await getTrpcClient();
      const result = await applyOp(client, opts.projectId, graphId, {
        op: "createNode",
        id: tempId,
        type: opts.type,
        position: { x: 80, y: 80 },
        data,
      });
      if (opts.json) {
        printJson(result);
      } else {
        const nodeId = result.applied[0]?.nodeId ?? result.idMappings[tempId] ?? "?";
        console.log(`Added ${opts.type} node (${nodeId}). Graph version ${result.version}.`);
      }
    });

  nodeCmd
    .command("remove <graphId> <nodeId>")
    .description("remove a node and its connected edges from a graph")
    .requiredOption("--project-id <id>", "project ID")
    .action(async (graphId: string, nodeId: string, opts: NodeRemoveOptions) => {
      const client = await getTrpcClient();
      const result = await applyOp(client, opts.projectId, graphId, {
        op: "deleteNode",
        id: nodeId,
      });
      console.log(`Removed node ${nodeId}. Graph version ${result.version}.`);
    });

  // ── graph edge ─────────────────────────────────────────────────────────────
  const edgeCmd = cmd.command("edge").description("manage edges in an Explorer graph");

  edgeCmd
    .command("add <graphId>")
    .description("connect two nodes with a typed relationship")
    .requiredOption("--project-id <id>", "project ID")
    .requiredOption("--source <nodeId>", "source node ID")
    .requiredOption("--target <nodeId>", "target node ID")
    .requiredOption("--relation <rel>", `relationship type: ${VALID_RELATIONS.join("|")}`)
    .option("--json", "output JSON")
    .action(async (graphId: string, opts: EdgeAddOptions) => {
      if (!(VALID_RELATIONS as readonly string[]).includes(opts.relation)) {
        throw new Error(`--relation must be one of: ${VALID_RELATIONS.join(", ")}`);
      }
      const tempId = `tmp_${randomUUID()}`;
      const client = await getTrpcClient();
      const result = await applyOp(client, opts.projectId, graphId, {
        op: "createEdge",
        id: tempId,
        source: opts.source,
        target: opts.target,
        relation: opts.relation,
        sourceHandle: null,
        targetHandle: null,
      });
      if (opts.json) {
        printJson(result);
      } else {
        const edgeId = result.applied[0]?.edgeId ?? result.idMappings[tempId] ?? "?";
        console.log(
          `Connected nodes via "${opts.relation}" (${edgeId}). Graph version ${result.version}.`,
        );
      }
    });

  edgeCmd
    .command("remove <graphId> <edgeId>")
    .description("remove an edge from a graph")
    .requiredOption("--project-id <id>", "project ID")
    .action(async (graphId: string, edgeId: string, opts: EdgeRemoveOptions) => {
      const client = await getTrpcClient();
      const result = await applyOp(client, opts.projectId, graphId, {
        op: "deleteEdge",
        id: edgeId,
      });
      console.log(`Removed edge ${edgeId}. Graph version ${result.version}.`);
    });
}
