import { and, asc, eq, gte, ilike, lte, max, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { ingestEnvelopes, ingestItems } from "../ingest/schema.js";
import { metricSamples } from "./schema.js";

export class MetricsRepository {
  public constructor(private readonly database: Database) {}

  async processItem(itemId: string): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      const [item] = await transaction
        .select({
          id: ingestItems.id,
          status: ingestItems.status,
          type: ingestItems.type,
          payload: ingestItems.payloadJson,
          projectId: ingestEnvelopes.projectId,
        })
        .from(ingestItems)
        .innerJoin(ingestEnvelopes, eq(ingestEnvelopes.id, ingestItems.envelopeId))
        .where(eq(ingestItems.id, itemId))
        .limit(1);
      if (!item || item.status !== "pending") return;
      if (item.type !== "trace_metric" || !item.payload || !Array.isArray(item.payload.items)) {
        await transaction
          .update(ingestItems)
          .set({ status: "failed", errorCode: "metric_payload_missing", processedAt: new Date() })
          .where(eq(ingestItems.id, itemId));
        return;
      }

      let inserted = 0;
      for (const [sampleIndex, value] of item.payload.items.entries()) {
        const metric = value as Record<string, unknown>;
        const rows = await transaction
          .insert(metricSamples)
          .values({
            projectId: item.projectId,
            ingestItemId: item.id,
            sampleIndex,
            timestamp: new Date((metric.timestamp as number) * 1_000),
            traceId: metric.trace_id === "" ? null : (metric.trace_id as string),
            spanId: typeof metric.span_id === "string" ? metric.span_id : null,
            name: metric.name as string,
            type: metric.type as string,
            unit: typeof metric.unit === "string" ? metric.unit : null,
            value: metric.value as number,
            attributes: (metric.attributes as Record<string, unknown> | undefined) ?? {},
          })
          .onConflictDoNothing()
          .returning({ id: metricSamples.id });
        inserted += rows.length;
      }
      await transaction
        .update(ingestItems)
        .set({
          status: inserted === 0 ? "processed_duplicate" : "processed",
          processedAt: new Date(),
          attempts: sql`${ingestItems.attempts} + 1`,
        })
        .where(and(eq(ingestItems.id, item.id), eq(ingestItems.status, "pending")));
    });
  }

  catalog(input: {
    projectId: string;
    from: Date;
    to: Date;
    prefix?: string;
    type?: string;
    cursor?: { name: string; type: string; unit: string };
    limit: number;
  }) {
    const normalizedUnit = sql<string>`coalesce(${metricSamples.unit}, '')`;
    const conditions = [
      eq(metricSamples.projectId, input.projectId),
      gte(metricSamples.timestamp, input.from),
      lte(metricSamples.timestamp, input.to),
    ];
    if (input.prefix) conditions.push(ilike(metricSamples.name, `${input.prefix}%`));
    if (input.type) conditions.push(eq(metricSamples.type, input.type));
    if (input.cursor) {
      conditions.push(
        sql`(${metricSamples.name}, ${metricSamples.type}, ${normalizedUnit}) > (${input.cursor.name}, ${input.cursor.type}, ${input.cursor.unit})`,
      );
    }
    const query = this.database.db
      .select({
        name: metricSamples.name,
        type: metricSamples.type,
        unit: metricSamples.unit,
        sampleCount: sql<number>`count(*)::integer`,
        lastSeen: max(metricSamples.timestamp),
      })
      .from(metricSamples)
      .where(and(...conditions))
      .groupBy(metricSamples.name, metricSamples.type, metricSamples.unit)
      .orderBy(asc(metricSamples.name), asc(metricSamples.type), asc(normalizedUnit))
      .limit(input.limit + 1);
    return query;
  }

  async series(input: {
    projectId: string;
    name: string;
    type: "counter" | "gauge" | "distribution";
    unit: string | null;
    from: Date;
    to: Date;
    resolution: "1m" | "5m" | "1h" | "1d";
    traceId?: string;
    spanId?: string;
    attributes: Record<string, string | number | boolean>;
  }) {
    const interval = { "1m": "1 minute", "5m": "5 minutes", "1h": "1 hour", "1d": "1 day" }[
      input.resolution
    ];
    const conditions = [
      eq(metricSamples.projectId, input.projectId),
      eq(metricSamples.name, input.name),
      eq(metricSamples.type, input.type),
      gte(metricSamples.timestamp, input.from),
      lte(metricSamples.timestamp, input.to),
      input.unit === null ? sql`${metricSamples.unit} is null` : eq(metricSamples.unit, input.unit),
    ];
    if (input.traceId) conditions.push(eq(metricSamples.traceId, input.traceId));
    if (input.spanId) conditions.push(eq(metricSamples.spanId, input.spanId));
    for (const [key, value] of Object.entries(input.attributes)) {
      const typed = {
        value,
        type:
          typeof value === "string"
            ? "string"
            : typeof value === "boolean"
              ? "boolean"
              : Number.isInteger(value)
                ? "integer"
                : "double",
      };
      conditions.push(
        sql`${metricSamples.attributes} @> ${JSON.stringify({ [key]: typed })}::jsonb`,
      );
    }
    const where = and(...conditions)!;
    const bucket = sql<Date>`date_bin(${interval}::interval, ${metricSamples.timestamp}, '1970-01-01'::timestamptz)`;
    const aggregate = {
      sum: sql<number>`coalesce(sum(${metricSamples.value}), 0)::double precision`,
      count: sql<number>`count(*)::integer`,
      min: sql<number>`min(${metricSamples.value})::double precision`,
      max: sql<number>`max(${metricSamples.value})::double precision`,
      avg: sql<number>`avg(${metricSamples.value})::double precision`,
      latest: sql<number>`(array_agg(${metricSamples.value} order by ${metricSamples.timestamp} desc, ${metricSamples.sampleIndex} desc))[1]::double precision`,
      p50: sql<number>`percentile_cont(0.50) within group (order by ${metricSamples.value})::double precision`,
      p95: sql<number>`percentile_cont(0.95) within group (order by ${metricSamples.value})::double precision`,
      p99: sql<number>`percentile_cont(0.99) within group (order by ${metricSamples.value})::double precision`,
    };
    const points = await this.database.db
      .select({ bucket, ...aggregate })
      .from(metricSamples)
      .where(where)
      // Drizzle parameterizes each interpolation independently. Reusing the
      // bucket expression in GROUP BY would therefore produce $1/$10/$11
      // interval parameters that PostgreSQL cannot recognize as the same
      // grouped expression. Ordinal references keep SELECT/GROUP/ORDER
      // aligned without interpolating the interval a second time.
      .groupBy(sql.raw("1"))
      .orderBy(sql.raw("1"));
    const [summary] = await this.database.db.select(aggregate).from(metricSamples).where(where);
    return { points, summary: summary ?? null };
  }
}
