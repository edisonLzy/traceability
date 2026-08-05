import type { AppRouter } from "@tracerability/server/trpc";
import type { TRPCClient } from "@trpc/client";
import { Command } from "commander";

import { printJson, printTable } from "../lib/output.js";
import { parseTimeRange } from "../lib/time.js";
import { getTrpcClient } from "../lib/trpc.js";

const METRIC_TYPES = ["counter", "gauge", "distribution"] as const;
type MetricType = (typeof METRIC_TYPES)[number];

const RESOLUTIONS = ["1m", "5m", "1h", "1d"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

interface MetricListOptions {
  projectId: string;
  prefix?: string;
  type?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: string;
  readable?: boolean;
}

interface MetricSeriesOptions {
  projectId: string;
  name: string;
  type?: string;
  unit?: string;
  resolution?: string;
  from?: string;
  to?: string;
  traceId?: string;
  spanId?: string;
  attr?: string[];
  readable?: boolean;
}

export function metricCommand(program: Command): void {
  const cmd = program.command("metric").description("query metric catalog and series");

  cmd
    .command("list")
    .requiredOption("--project-id <id>", "project ID")
    .option("--prefix <prefix>", "metric name prefix")
    .option("--type <type>", "metric type (counter, gauge, distribution)")
    .option("--from <time>", "range start (e.g. 1h, 30m, or ISO timestamp)")
    .option("--to <time>", "range end (e.g. 1h, 30m, or ISO timestamp)")
    .option("--cursor <cursor>", "pagination cursor from a previous list")
    .option("--limit <n>", "max results", "50")
    .option("--readable", "human-readable table output")
    .action(async (opts: MetricListOptions) => {
      const client = await getTrpcClient();
      const range = parseTimeRange(opts.from, opts.to);
      const result = await client.metrics.catalog.query({
        projectId: opts.projectId,
        ...(opts.prefix ? { prefix: opts.prefix } : {}),
        ...(opts.type ? { type: assertMetricType(opts.type) } : {}),
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
        ...(opts.cursor ? { cursor: opts.cursor } : {}),
        limit: Number(opts.limit ?? "50"),
      });
      if (opts.readable) {
        printTable(result.data, [
          { key: "name", label: "NAME", width: 32 },
          { key: "type", label: "TYPE", width: 12 },
          { key: "unit", label: "UNIT", width: 12 },
          { key: "sampleCount", label: "SAMPLES", width: 8 },
          { key: "lastSeen", label: "LAST SEEN", width: 28 },
        ]);
        if (result.nextCursor) {
          console.error(`(more results — use --cursor ${result.nextCursor})`);
        }
      } else {
        printJson(result);
      }
    });

  cmd
    .command("series")
    .requiredOption("--project-id <id>", "project ID")
    .requiredOption("--name <name>", "metric name")
    .option("--type <type>", "metric type (counter, gauge, distribution)")
    .option("--unit <unit>", "metric unit; pass an empty string for no unit")
    .option("--resolution <res>", "bucket resolution (1m, 5m, 1h, 1d)", "1h")
    .option("--from <time>", "range start (e.g. 1h, 30m, or ISO timestamp)")
    .option("--to <time>", "range end (e.g. 1h, 30m, or ISO timestamp)")
    .option("--trace-id <id>", "only samples under this trace id")
    .option("--span-id <id>", "only samples under this span id")
    .option("--attr <k=v>", "attribute equality filter (repeatable, max 10)", collectAttr, [])
    .option("--readable", "human-readable summary and table output")
    .action(async (opts: MetricSeriesOptions) => {
      const client = await getTrpcClient();
      const range = parseTimeRange(opts.from, opts.to);
      const resolution = assertResolution(opts.resolution ?? "1h");
      const { type, unit } = await resolveTypeUnit(client, opts);
      const result = await client.metrics.series.query({
        projectId: opts.projectId,
        name: opts.name,
        type,
        unit,
        resolution,
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
        ...(opts.traceId ? { traceId: opts.traceId } : {}),
        ...(opts.spanId ? { spanId: opts.spanId } : {}),
        attributes: parseAttributes(opts.attr),
      });
      if (opts.readable) {
        console.log(formatSummary(type, result.summary));
        printTable(result.points, SERIES_COLUMNS[type]);
      } else {
        printJson(result);
      }
    });
}

const SERIES_COLUMNS: Record<MetricType, Array<{ key: string; label: string; width?: number }>> = {
  counter: [
    { key: "bucket", label: "BUCKET", width: 28 },
    { key: "sum", label: "SUM", width: 16 },
  ],
  gauge: [
    { key: "bucket", label: "BUCKET", width: 28 },
    { key: "latest", label: "LATEST", width: 12 },
    { key: "min", label: "MIN", width: 12 },
    { key: "max", label: "MAX", width: 12 },
    { key: "avg", label: "AVG", width: 12 },
  ],
  distribution: [
    { key: "bucket", label: "BUCKET", width: 28 },
    { key: "count", label: "COUNT", width: 8 },
    { key: "sum", label: "SUM", width: 12 },
    { key: "min", label: "MIN", width: 12 },
    { key: "max", label: "MAX", width: 12 },
    { key: "avg", label: "AVG", width: 12 },
    { key: "p50", label: "P50", width: 12 },
    { key: "p95", label: "P95", width: 12 },
    { key: "p99", label: "P99", width: 12 },
  ],
};

function formatSummary(type: MetricType, summary: Record<string, unknown> | null): string {
  if (!summary) return "summary: (no data)";
  if (type === "counter") return `summary: sum ${summary.sum}`;
  if (type === "gauge") {
    return `summary: latest ${summary.latest}  min ${summary.min}  max ${summary.max}  avg ${summary.avg}`;
  }
  return (
    `summary: count ${summary.count}  sum ${summary.sum}  min ${summary.min}  max ${summary.max}` +
    `  avg ${summary.avg}  p50 ${summary.p50}  p95 ${summary.p95}  p99 ${summary.p99}`
  );
}

function collectAttr(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function assertMetricType(type: string): MetricType {
  if ((METRIC_TYPES as readonly string[]).includes(type)) return type as MetricType;
  throw new Error(`Invalid --type: ${type} (expected counter, gauge, or distribution)`);
}

function assertResolution(resolution: string): Resolution {
  if ((RESOLUTIONS as readonly string[]).includes(resolution)) return resolution as Resolution;
  throw new Error(`Invalid --resolution: ${resolution} (expected 1m, 5m, 1h, or 1d)`);
}

function parseAttributes(values: string[] | undefined): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};
  for (const value of values ?? []) {
    const eq = value.indexOf("=");
    if (eq <= 0) throw new Error(`Invalid --attr (expected key=value): ${value}`);
    const key = value.slice(0, eq);
    if (key.length > 200) throw new Error(`--attr key too long: ${key}`);
    attributes[key] = parseAttributeValue(value.slice(eq + 1));
  }
  if (Object.keys(attributes).length > 10) {
    throw new Error("at most 10 --attr filters are allowed");
  }
  return attributes;
}

function parseAttributeValue(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?(\d+(\.\d+)?|\.\d+)$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * Fill a missing `--type`/`--unit` from the catalog. The metric name must
 * resolve to exactly one candidate; anything else lists the options so the
 * user can disambiguate.
 */
async function resolveTypeUnit(
  client: TRPCClient<AppRouter>,
  opts: MetricSeriesOptions,
): Promise<{ type: MetricType; unit: string | null }> {
  const type = opts.type === undefined ? undefined : assertMetricType(opts.type);
  if (type && opts.unit !== undefined) {
    return { type, unit: opts.unit === "" ? null : opts.unit };
  }
  const catalog = await client.metrics.catalog.query({
    projectId: opts.projectId,
    prefix: opts.name,
    limit: 100,
  });
  const candidates = catalog.data.filter(
    (metric) =>
      metric.name === opts.name &&
      (type === undefined || metric.type === type) &&
      (opts.unit === undefined || (metric.unit ?? "") === (opts.unit ?? "")),
  );
  if (candidates.length === 0) {
    throw new Error(`No metric named "${opts.name}" in the catalog`);
  }
  if (candidates.length > 1) {
    const listing = candidates
      .map((metric) => `  ${metric.name}  ${metric.type}  ${metric.unit ?? ""}`)
      .join("\n");
    throw new Error(
      `Metric "${opts.name}" is ambiguous; pass --type and --unit to disambiguate:\n${listing}`,
    );
  }
  const [metric] = candidates;
  return { type: assertMetricType(metric!.type), unit: metric!.unit ?? null };
}
