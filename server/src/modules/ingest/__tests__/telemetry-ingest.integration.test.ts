import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../../app.js";
import { loadRuntimeConfig } from "../../../config/index.js";
import { createAccessToken } from "../../../helper/auth.js";
import { createDatabase, type Database } from "../../../infrastructure/database/client.js";
import { MetricsRepository, MetricsService } from "../../metrics/index.js";
import { metricSamples } from "../../metrics/schema.js";
import { ProcessingRepository, ProcessingService } from "../../processing/index.js";
import { TraceRepository, TraceService } from "../../traces/index.js";
import { traceSpans } from "../../traces/schema.js";
import { ingestItems, outbox } from "../schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("Trace and Metric ingestion", () => {
  let database: Database;
  let app: Awaited<ReturnType<typeof createApp>>;
  let accessToken: string;

  beforeAll(async () => {
    database = createDatabase({ connectionString: databaseUrl!, maxConnections: 2 });
    await database.db.execute(
      "TRUNCATE metric_samples, trace_spans, replay_segments, replay_sessions, events, issues, outbox, outcomes, ingest_items, ingest_envelopes, project_policies, project_keys, projects CASCADE",
    );
    const config = loadRuntimeConfig({
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl!,
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
      PUBLIC_INGEST_URL: "http://127.0.0.1:3000",
      LOG_LEVEL: "fatal",
    });
    accessToken = createAccessToken(
      { id: "00000000-0000-4000-8000-000000000001", username: "root", email: "root@root.com" },
      config,
    );
    app = await createApp({ config, database });
  });

  afterAll(async () => app?.close());

  it("processes idempotent spans and metrics and exposes correlated queries", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/trpc/projects.create",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      payload: { slug: "telemetry-integration", name: "Telemetry Integration" },
    });
    const created = projectResponse.json().result.data as {
      project: { id: string; sentryProjectId: number };
      dsn: string;
    };
    const traceId = "a".repeat(32);
    const rootSpanId = "b".repeat(16);
    const childSpanId = "c".repeat(16);
    const transactionId = randomUUID().replaceAll("-", "");
    const envelope = [
      JSON.stringify({ event_id: transactionId, dsn: created.dsn }),
      JSON.stringify({ type: "transaction", content_type: "application/json" }),
      JSON.stringify({
        event_id: transactionId,
        transaction: "im.push.recover",
        start_timestamp: 100,
        timestamp: 101,
        environment: "test",
        contexts: {
          trace: { trace_id: traceId, span_id: rootSpanId, op: "messaging.sync", status: "ok" },
        },
        spans: [
          {
            trace_id: traceId,
            span_id: childSpanId,
            parent_span_id: rootSpanId,
            description: "persist recovered messages",
            op: "db.write",
            start_timestamp: 100.1,
            timestamp: 100.9,
            data: {},
          },
        ],
      }),
      JSON.stringify({
        type: "trace_metric",
        item_count: 7,
        content_type: "application/vnd.sentry.items.trace-metric+json",
      }),
      JSON.stringify({
        version: 2,
        items: [
          {
            timestamp: 100.2,
            trace_id: traceId,
            span_id: rootSpanId,
            name: "im.push.recovered",
            type: "counter",
            value: 2,
            attributes: { state: { value: "connected", type: "string" } },
          },
          {
            timestamp: 100.3,
            trace_id: traceId,
            span_id: rootSpanId,
            name: "im.push.cursor_lag",
            type: "gauge",
            value: 4,
            attributes: { state: { value: "connected", type: "string" } },
          },
          {
            timestamp: 100.4,
            trace_id: traceId,
            span_id: rootSpanId,
            name: "im.push.duration",
            type: "distribution",
            unit: "millisecond",
            value: 25,
            attributes: { state: { value: "connected", type: "string" } },
          },
          {
            timestamp: 100.5,
            trace_id: traceId,
            span_id: rootSpanId,
            name: "im.push.recovered",
            type: "counter",
            value: 3,
            attributes: { state: { value: "connected", type: "string" } },
          },
          {
            timestamp: 100.6,
            trace_id: traceId,
            span_id: rootSpanId,
            name: "im.push.cursor_lag",
            type: "gauge",
            value: 6,
            attributes: { state: { value: "connected", type: "string" } },
          },
          {
            timestamp: 100.7,
            trace_id: traceId,
            span_id: rootSpanId,
            name: "im.push.duration",
            type: "distribution",
            unit: "millisecond",
            value: 75,
            attributes: { state: { value: "connected", type: "string" } },
          },
          {
            timestamp: 100.8,
            trace_id: traceId,
            span_id: childSpanId,
            name: "im.push.duration",
            type: "distribution",
            unit: "second",
            value: 1,
            attributes: { state: { value: "connected", type: "string" } },
          },
        ],
      }),
      JSON.stringify({ type: "span", content_type: "application/json" }),
      JSON.stringify({
        trace_id: traceId,
        span_id: "d".repeat(16),
        parent_span_id: rootSpanId,
        description: "legacy standalone span",
        op: "cache.read",
        start_timestamp: 100.2,
        timestamp: 100.4,
        data: { cache: "redis" },
      }),
      JSON.stringify({
        type: "span",
        item_count: 1,
        content_type: "application/vnd.sentry.items.span.v2+json",
      }),
      JSON.stringify({
        version: 2,
        items: [
          {
            trace_id: traceId,
            span_id: "e".repeat(16),
            parent_span_id: rootSpanId,
            name: "streamed standalone span",
            start_timestamp: 100.3,
            end_timestamp: 100.5,
            attributes: {
              "sentry.op": { value: "http.client", type: "string" },
            },
          },
        ],
      }),
      JSON.stringify({ type: "statsd", content_type: "text/plain" }),
      "legacy.counter:1|c",
      "",
    ].join("\n");
    const accepted = await app.inject({
      method: "POST",
      url: `/api/${created.project.sentryProjectId}/envelope/`,
      headers: { "content-type": "application/x-sentry-envelope" },
      payload: envelope,
    });
    expect(accepted.statusCode).toBe(200);

    const items = await database.db.select().from(ingestItems);
    const transactionItem = items.find((item) => item.type === "transaction")!;
    const metricItem = items.find((item) => item.type === "trace_metric")!;
    const spanItems = items.filter((item) => item.type === "span");
    const statsdItem = items.find((item) => item.type === "statsd")!;
    expect(statsdItem.status).toBe("ignored");
    expect(statsdItem.errorCode).toBe("unsupported_item");
    const outboxRows = await database.db.select().from(outbox);
    expect(outboxRows.map((row) => row.topic)).toEqual(
      expect.arrayContaining(["ingest.transaction", "ingest.trace_metric", "ingest.span"]),
    );
    expect(outboxRows.map((row) => row.topic)).not.toContain("ingest.statsd");
    const traces = new TraceService(new TraceRepository(database));
    const metrics = new MetricsService(new MetricsRepository(database));
    await traces.processTransactionItem(transactionItem.id);
    await traces.processTransactionItem(transactionItem.id);
    for (const spanItem of spanItems) {
      await traces.processSpanItem(spanItem.id);
      await traces.processSpanItem(spanItem.id);
    }
    await metrics.processItem(metricItem.id);
    await metrics.processItem(metricItem.id);

    expect(await database.db.select().from(traceSpans)).toHaveLength(4);
    expect(await database.db.select().from(metricSamples)).toHaveLength(7);
    const processedItems = await database.db.select().from(ingestItems);
    expect(processedItems.find((item) => item.id === transactionItem.id)?.status).toBe("processed");
    expect(processedItems.find((item) => item.id === metricItem.id)?.status).toBe("processed");

    const trace = await traces.get(created.project.id, traceId);
    expect(trace.roots).toHaveLength(1);
    expect(trace.roots[0]).toMatchObject({ name: "im.push.recover" });
    expect((trace.roots[0] as { children: unknown[] }).children).toHaveLength(3);
    expect(trace.metricCount).toBe(7);

    const range = { from: new Date(0), to: new Date(200_000) };
    const counterSeries = await metrics.series({
      projectId: created.project.id,
      name: "im.push.recovered",
      type: "counter",
      unit: null,
      ...range,
      resolution: "1m",
      traceId,
      attributes: { state: "connected" },
    });
    expect(counterSeries.summary).toEqual({ sum: 5 });

    const gaugeSeries = await metrics.series({
      projectId: created.project.id,
      name: "im.push.cursor_lag",
      type: "gauge",
      unit: null,
      ...range,
      resolution: "1m",
      traceId,
      spanId: rootSpanId,
      attributes: { state: "connected" },
    });
    expect(gaugeSeries.summary).toEqual({ latest: 6, min: 4, max: 6, avg: 5 });

    const series = await metrics.series({
      projectId: created.project.id,
      name: "im.push.duration",
      type: "distribution",
      unit: "millisecond",
      ...range,
      resolution: "1m",
      traceId,
      attributes: { state: "connected" },
    });
    expect(series.summary).toMatchObject({
      count: 2,
      sum: 100,
      min: 25,
      max: 75,
      avg: 50,
      p50: 50,
      p95: 72.5,
      p99: 74.5,
    });

    const unitIsolated = await metrics.series({
      projectId: created.project.id,
      name: "im.push.duration",
      type: "distribution",
      unit: "second",
      ...range,
      resolution: "1m",
      traceId,
      spanId: childSpanId,
      attributes: { state: "connected" },
    });
    expect(unitIsolated.summary).toMatchObject({ count: 1, sum: 1, min: 1, max: 1 });

    const eventId = randomUUID().replaceAll("-", "");
    const errorEnvelope = [
      JSON.stringify({ event_id: eventId, dsn: created.dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify({
        event_id: eventId,
        timestamp: 100.5,
        contexts: { trace: { trace_id: traceId, span_id: rootSpanId } },
        exception: { values: [{ type: "Error", value: "recover failed" }] },
      }),
      "",
    ].join("\n");
    await app.inject({
      method: "POST",
      url: `/api/${created.project.sentryProjectId}/envelope/`,
      headers: { "content-type": "application/x-sentry-envelope" },
      payload: errorEnvelope,
    });
    const [eventItem] = await database.db
      .select()
      .from(ingestItems)
      .where(eq(ingestItems.eventId, eventId));
    await new ProcessingService(new ProcessingRepository(database)).processEventItem(eventItem!.id);
    expect((await traces.get(created.project.id, traceId)).linkedEvents).toHaveLength(1);

    const policyResponse = await app.inject({
      method: "POST",
      url: "/api/trpc/projects.updatePolicy",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      payload: {
        projectId: created.project.id,
        patch: {
          allowedOrigins: [],
          rateLimitPerSecond: 100,
          enabledItemTypes: ["event", "transaction", "span"],
          scrubRules: {},
        },
      },
    });
    expect(policyResponse.statusCode).toBe(200);
    const disabledMetricEnvelope = [
      JSON.stringify({ dsn: created.dsn }),
      JSON.stringify({ type: "trace_metric", item_count: 1 }),
      JSON.stringify({
        version: 2,
        items: [
          {
            timestamp: 101,
            trace_id: traceId,
            span_id: rootSpanId,
            name: "im.push.disabled",
            type: "counter",
            value: 1,
          },
        ],
      }),
      "",
    ].join("\n");
    const disabledResponse = await app.inject({
      method: "POST",
      url: `/api/${created.project.sentryProjectId}/envelope/`,
      headers: { "content-type": "application/x-sentry-envelope" },
      payload: disabledMetricEnvelope,
    });
    expect(disabledResponse.statusCode).toBe(200);
    const disabledItem = (await database.db.select().from(ingestItems)).find(
      (item) => item.type === "trace_metric" && item.id !== metricItem.id,
    );
    expect(disabledItem).toMatchObject({ status: "ignored", errorCode: "unsupported_item" });
  });
});
