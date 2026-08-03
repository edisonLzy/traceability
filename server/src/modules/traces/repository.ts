import { and, count, desc, eq, gte, ilike, lt, lte, or, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { ingestEnvelopes, ingestItems } from "../ingest/schema.js";
import { events } from "../issues/schema.js";
import { metricSamples } from "../metrics/schema.js";
import { traceSpans } from "./schema.js";
import type { NormalizedSpan } from "./types.js";

export class TraceRepository {
  public constructor(private readonly database: Database) {}

  async processItem(
    itemId: string,
    expectedType: "transaction" | "span",
    normalize: (
      header: Record<string, unknown>,
      payload: Record<string, unknown>,
    ) => NormalizedSpan[],
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      const [item] = await transaction
        .select({
          id: ingestItems.id,
          status: ingestItems.status,
          type: ingestItems.type,
          header: ingestItems.header,
          payload: ingestItems.payloadJson,
          projectId: ingestEnvelopes.projectId,
        })
        .from(ingestItems)
        .innerJoin(ingestEnvelopes, eq(ingestEnvelopes.id, ingestItems.envelopeId))
        .where(eq(ingestItems.id, itemId))
        .limit(1);
      if (!item || item.status !== "pending") return;
      if (item.type !== expectedType || !item.payload) {
        await transaction
          .update(ingestItems)
          .set({ status: "failed", errorCode: "trace_payload_missing", processedAt: new Date() })
          .where(eq(ingestItems.id, itemId));
        return;
      }

      const spans = normalize(item.header, item.payload);
      let inserted = 0;
      for (const span of spans) {
        const rows = await transaction
          .insert(traceSpans)
          .values({ ...span, ingestItemId: item.id, projectId: item.projectId })
          .onConflictDoNothing()
          .returning({ id: traceSpans.id });
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

  list(input: {
    projectId: string;
    from: Date;
    to: Date;
    name?: string;
    op?: string;
    status?: string;
    environment?: string;
    release?: string;
    cursor?: { startTimestamp: Date; id: string };
    limit: number;
  }) {
    const conditions = [
      eq(traceSpans.projectId, input.projectId),
      eq(traceSpans.isSegment, true),
      gte(traceSpans.startTimestamp, input.from),
      lte(traceSpans.startTimestamp, input.to),
    ];
    if (input.name) conditions.push(ilike(traceSpans.name, `%${input.name}%`));
    if (input.op) conditions.push(eq(traceSpans.op, input.op));
    if (input.status) conditions.push(eq(traceSpans.status, input.status));
    if (input.environment) conditions.push(eq(traceSpans.environment, input.environment));
    if (input.release) conditions.push(eq(traceSpans.release, input.release));
    if (input.cursor) {
      conditions.push(
        or(
          lt(traceSpans.startTimestamp, input.cursor.startTimestamp),
          and(
            eq(traceSpans.startTimestamp, input.cursor.startTimestamp),
            lt(traceSpans.id, input.cursor.id),
          ),
        )!,
      );
    }
    return this.database.db
      .select()
      .from(traceSpans)
      .where(and(...conditions))
      .orderBy(desc(traceSpans.startTimestamp), desc(traceSpans.id))
      .limit(input.limit + 1);
  }

  async get(projectId: string, traceId: string) {
    const spans = await this.database.db
      .select()
      .from(traceSpans)
      .where(and(eq(traceSpans.projectId, projectId), eq(traceSpans.traceId, traceId)))
      .orderBy(traceSpans.startTimestamp, traceSpans.id);
    const linkedEvents = await this.database.db
      .select({
        id: events.id,
        eventId: events.eventId,
        issueId: events.issueId,
        timestamp: events.eventTimestamp,
        level: events.level,
      })
      .from(events)
      .where(and(eq(events.projectId, projectId), eq(events.traceId, traceId)))
      .orderBy(events.eventTimestamp, events.id);
    const [metricCount] = await this.database.db
      .select({ value: count() })
      .from(metricSamples)
      .where(and(eq(metricSamples.projectId, projectId), eq(metricSamples.traceId, traceId)));
    return { spans, linkedEvents, metricCount: metricCount?.value ?? 0 };
  }
}
