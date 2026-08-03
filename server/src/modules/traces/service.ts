import { TRPCError } from "@trpc/server";

import { normalizeSpanItem, normalizeTransaction } from "./normalizer.js";
import type { TraceRepository } from "./repository.js";

export class TraceService {
  public constructor(private readonly repository: TraceRepository) {}

  processTransactionItem(itemId: string): Promise<void> {
    return this.repository.processItem(itemId, "transaction", (_header, payload) =>
      normalizeTransaction(payload),
    );
  }

  processSpanItem(itemId: string): Promise<void> {
    return this.repository.processItem(itemId, "span", normalizeSpanItem);
  }

  async list(input: {
    projectId: string;
    from?: Date;
    to?: Date;
    name?: string;
    op?: string;
    status?: string;
    environment?: string;
    release?: string;
    cursor?: string;
    limit: number;
  }) {
    const range = queryRange(input.from, input.to);
    const rows = await this.repository.list({
      ...input,
      ...range,
      cursor: decodeCursor(input.cursor),
    });
    const hasMore = rows.length > input.limit;
    const data = hasMore ? rows.slice(0, input.limit) : rows;
    const finalSpan = data.at(-1);
    return {
      data,
      nextCursor:
        hasMore && finalSpan ? encodeCursor(finalSpan.startTimestamp, finalSpan.id) : null,
    };
  }

  async get(projectId: string, traceId: string) {
    const result = await this.repository.get(projectId, traceId);
    const nodes = new Map(
      result.spans.map((span) => [
        span.spanId,
        { ...span, orphaned: false, children: [] as Array<Record<string, unknown>> },
      ]),
    );
    const roots: Array<Record<string, unknown>> = [];
    for (const node of nodes.values()) {
      const parent = node.parentSpanId ? nodes.get(node.parentSpanId) : undefined;
      if (!parent || parent === node || createsCycle(node.spanId, parent.spanId, nodes)) {
        node.orphaned = !!node.parentSpanId;
        roots.push(node);
      } else {
        parent.children.push(node);
      }
    }
    const sortTree = (node: { startTimestamp: Date; children: Array<Record<string, unknown>> }) => {
      node.children.sort(
        (left, right) =>
          (left.startTimestamp as Date).valueOf() - (right.startTimestamp as Date).valueOf(),
      );
      node.children.forEach((child) =>
        sortTree(child as { startTimestamp: Date; children: Array<Record<string, unknown>> }),
      );
    };
    roots.sort(
      (left, right) =>
        (left.startTimestamp as Date).valueOf() - (right.startTimestamp as Date).valueOf(),
    );
    roots.forEach((root) =>
      sortTree(root as { startTimestamp: Date; children: Array<Record<string, unknown>> }),
    );
    return { traceId, roots, linkedEvents: result.linkedEvents, metricCount: result.metricCount };
  }
}

const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1_000;

function queryRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const resolvedTo = to ?? new Date();
  const resolvedFrom = from ?? new Date(resolvedTo.valueOf() - 24 * 60 * 60 * 1_000);
  if (resolvedFrom >= resolvedTo || resolvedTo.valueOf() - resolvedFrom.valueOf() > MAX_RANGE_MS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "trace query range must be positive and at most 30 days",
    });
  }
  return { from: resolvedFrom, to: resolvedTo };
}

function encodeCursor(startTimestamp: Date, id: string): string {
  return Buffer.from(JSON.stringify({ startTimestamp: startTimestamp.toISOString(), id })).toString(
    "base64url",
  );
}

function decodeCursor(raw?: string): { startTimestamp: Date; id: string } | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      startTimestamp?: unknown;
      id?: unknown;
    };
    const startTimestamp =
      typeof value.startTimestamp === "string" ? new Date(value.startTimestamp) : undefined;
    if (!startTimestamp || Number.isNaN(startTimestamp.valueOf()) || typeof value.id !== "string") {
      throw new Error("invalid");
    }
    return { startTimestamp, id: value.id };
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "trace cursor is invalid" });
  }
}

function createsCycle(
  childId: string,
  parentId: string,
  nodes: Map<string, { parentSpanId: string | null }>,
): boolean {
  const visited = new Set([childId]);
  let current: string | null = parentId;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = nodes.get(current)?.parentSpanId ?? null;
  }
  return false;
}
