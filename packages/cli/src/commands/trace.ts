import { Command } from "commander";

import { printJson, printTable } from "../lib/output.js";
import { parseTimeRange } from "../lib/time.js";
import { getTrpcClient } from "../lib/trpc.js";

interface TraceListOptions {
  projectId: string;
  name?: string;
  op?: string;
  status?: string;
  environment?: string;
  release?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: string;
  readable?: boolean;
}

interface TraceShowOptions {
  projectId: string;
  readable?: boolean;
}

interface SpanNode {
  name: string;
  op: string | null;
  status: string | null;
  durationMs: number;
  orphaned?: boolean;
  children: SpanNode[];
}

export function traceCommand(program: Command): void {
  const cmd = program.command("trace").description("list and inspect traces");

  cmd
    .command("list")
    .requiredOption("--project-id <id>", "project ID")
    .option("--name <name>", "filter by trace name")
    .option("--op <op>", "filter by operation")
    .option("--status <status>", "filter by status")
    .option("--environment <env>", "filter by environment")
    .option("--release <release>", "filter by release")
    .option("--from <time>", "range start (e.g. 1h, 30m, or ISO timestamp)")
    .option("--to <time>", "range end (e.g. 1h, 30m, or ISO timestamp)")
    .option("--cursor <cursor>", "pagination cursor from a previous list")
    .option("--limit <n>", "max results", "50")
    .option("--readable", "human-readable table output")
    .action(async (opts: TraceListOptions) => {
      const client = await getTrpcClient();
      const range = parseTimeRange(opts.from, opts.to);
      const result = await client.traces.list.query({
        projectId: opts.projectId,
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.op ? { op: opts.op } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.environment ? { environment: opts.environment } : {}),
        ...(opts.release ? { release: opts.release } : {}),
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
        ...(opts.cursor ? { cursor: opts.cursor } : {}),
        limit: Number(opts.limit ?? "50"),
      });
      if (opts.readable) {
        printTable(result.data, [
          { key: "traceId", label: "TRACE ID", width: 32 },
          { key: "name", label: "NAME", width: 32 },
          { key: "op", label: "OP", width: 16 },
          { key: "status", label: "STATUS", width: 12 },
          { key: "durationMs", label: "DURATION", width: 10 },
          { key: "startTimestamp", label: "START", width: 28 },
        ]);
        if (result.nextCursor) {
          console.error(`(more results — use --cursor ${result.nextCursor})`);
        }
      } else {
        printJson(result);
      }
    });

  cmd
    .command("show <traceId>")
    .requiredOption("--project-id <id>", "project ID")
    .option("--readable", "human-readable span tree output")
    .action(async (traceId: string, opts: TraceShowOptions) => {
      const client = await getTrpcClient();
      const trace = await client.traces.get.query({ projectId: opts.projectId, traceId });
      if (opts.readable) {
        // The server guarantees each root carries a span plus `orphaned`
        // and `children`; its declared type is intentionally loose.
        renderTrace({ ...trace, roots: trace.roots as unknown as SpanNode[] });
      } else {
        printJson(trace);
      }
    });
}

function renderTrace(trace: {
  roots: SpanNode[];
  linkedEvents: { length: number };
  metricCount: number;
}): void {
  if (trace.roots.length === 0) {
    console.log("(no spans)");
  } else {
    for (const root of trace.roots) {
      printSpanNode(root, 0);
    }
  }
  console.log(`${trace.linkedEvents.length} linked events · ${trace.metricCount} metrics`);
}

function printSpanNode(span: SpanNode, depth: number): void {
  const fields = [`${formatMs(span.durationMs)}`, span.status ?? "-", span.op ?? "-", span.name];
  const line = fields.join("  ") + (span.orphaned ? "  [orphaned]" : "");
  console.log("  ".repeat(depth) + line);
  for (const child of span.children) {
    printSpanNode(child, depth + 1);
  }
}

function formatMs(ms: number): string {
  return `${Number.isInteger(ms) ? ms : ms.toFixed(1)}ms`;
}
