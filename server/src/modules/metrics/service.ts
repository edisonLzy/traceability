import { TRPCError } from "@trpc/server";

import type { MetricsRepository } from "./repository.js";

export class MetricsService {
  public constructor(private readonly repository: MetricsRepository) {}

  processItem(itemId: string): Promise<void> {
    return this.repository.processItem(itemId);
  }

  async catalog(input: {
    projectId: string;
    from?: Date;
    to?: Date;
    prefix?: string;
    type?: string;
    cursor?: string;
    limit: number;
  }) {
    const range = queryRange(input.from, input.to);
    const rows = await this.repository.catalog({
      ...input,
      ...range,
      cursor: decodeCursor(input.cursor),
    });
    const hasMore = rows.length > input.limit;
    const data = hasMore ? rows.slice(0, input.limit) : rows;
    const finalMetric = data.at(-1);
    return {
      data,
      nextCursor:
        hasMore && finalMetric
          ? encodeCursor(finalMetric.name, finalMetric.type, finalMetric.unit ?? "")
          : null,
    };
  }

  async series(input: {
    projectId: string;
    name: string;
    type: "counter" | "gauge" | "distribution";
    unit: string | null;
    from?: Date;
    to?: Date;
    resolution: "1m" | "5m" | "1h" | "1d";
    traceId?: string;
    spanId?: string;
    attributes: Record<string, string | number | boolean>;
  }) {
    const range = queryRange(input.from, input.to);
    const result = await this.repository.series({ ...input, ...range });
    return {
      type: input.type,
      unit: input.unit,
      ...selectAggregates(input.type, result),
    };
  }

  async groups(input: {
    projectId: string;
    name: string;
    type: "counter" | "gauge" | "distribution";
    unit: string | null;
    from?: Date;
    to?: Date;
    traceId?: string;
    spanId?: string;
    attributes: Record<string, string | number | boolean>;
    groupBy: string;
    orderBy?: "count" | "sum" | "min" | "max" | "avg" | "latest" | "p50" | "p95" | "p99";
    orderDesc?: boolean;
    limit?: number;
  }) {
    const range = queryRange(input.from, input.to);
    const groups = await this.repository.groups({
      ...input,
      ...range,
      orderBy: input.orderBy ?? "count",
      orderDesc: input.orderDesc ?? true,
      limit: input.limit ?? 50,
    });
    return {
      type: input.type,
      unit: input.unit,
      groupBy: input.groupBy,
      groups: selectGroupAggregates(input.type, groups),
    };
  }
}

const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1_000;

function queryRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const resolvedTo = to ?? new Date();
  const resolvedFrom = from ?? new Date(resolvedTo.valueOf() - 24 * 60 * 60 * 1_000);
  if (resolvedFrom >= resolvedTo || resolvedTo.valueOf() - resolvedFrom.valueOf() > MAX_RANGE_MS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "metric query range must be positive and at most 30 days",
    });
  }
  return { from: resolvedFrom, to: resolvedTo };
}

function selectAggregates(
  type: "counter" | "gauge" | "distribution",
  result: Awaited<ReturnType<MetricsRepository["series"]>>,
) {
  const empty = !result.summary || result.summary.count === 0;
  const summary = empty ? null : result.summary!;
  if (type === "counter") {
    return {
      points: result.points.map(({ bucket, sum }) => ({ bucket, sum })),
      summary: summary ? { sum: summary.sum } : null,
    };
  }
  if (type === "gauge") {
    return {
      points: result.points.map(({ bucket, latest, min, max, avg }) => ({
        bucket,
        latest,
        min,
        max,
        avg,
      })),
      summary: summary
        ? {
            latest: summary.latest,
            min: summary.min,
            max: summary.max,
            avg: summary.avg,
          }
        : null,
    };
  }
  return {
    points: result.points.map(({ bucket, count, sum, min, max, avg, p50, p95, p99 }) => ({
      bucket,
      count,
      sum,
      min,
      max,
      avg,
      p50,
      p95,
      p99,
    })),
    summary: summary
      ? {
          count: summary.count,
          sum: summary.sum,
          min: summary.min,
          max: summary.max,
          avg: summary.avg,
          p50: summary.p50,
          p95: summary.p95,
          p99: summary.p99,
        }
      : null,
  };
}

function selectGroupAggregates(
  type: "counter" | "gauge" | "distribution",
  groups: Awaited<ReturnType<MetricsRepository["groups"]>>,
) {
  if (type === "counter") {
    return groups.map(({ value, count, sum }) => ({ value, count, sum }));
  }
  if (type === "gauge") {
    return groups.map(({ value, count, latest, min, max, avg }) => ({
      value,
      count,
      latest,
      min,
      max,
      avg,
    }));
  }
  return groups.map(({ value, count, sum, min, max, avg, p50, p95, p99 }) => ({
    value,
    count,
    sum,
    min,
    max,
    avg,
    p50,
    p95,
    p99,
  }));
}

function encodeCursor(name: string, type: string, unit: string): string {
  return Buffer.from(JSON.stringify({ name, type, unit })).toString("base64url");
}

function decodeCursor(raw?: string): { name: string; type: string; unit: string } | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      typeof value.name !== "string" ||
      typeof value.type !== "string" ||
      typeof value.unit !== "string"
    ) {
      throw new Error("invalid");
    }
    return { name: value.name, type: value.type, unit: value.unit };
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "metric cursor is invalid" });
  }
}
