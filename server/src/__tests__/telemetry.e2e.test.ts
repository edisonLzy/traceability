import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { loadRuntimeConfig } from "../config/index.js";
import { createAccessToken } from "../helper/auth.js";
import { createDatabase, type Database } from "../infrastructure/database/client.js";
import { ingestItems } from "../modules/ingest/schema.js";
import { createItemProcessors } from "../modules/processing/registry.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeE2E = databaseUrl ? describe : describe.skip;

describeE2E("server telemetry HTTP E2E", () => {
  let database: Database;
  let app: Awaited<ReturnType<typeof createApp>>;
  let baseUrl: string;
  let accessToken: string;

  beforeAll(async () => {
    database = createDatabase({ connectionString: databaseUrl!, maxConnections: 4 });
    await database.db.execute(
      "TRUNCATE metric_samples, trace_spans, replay_segments, replay_sessions, events, issues, outbox, outcomes, ingest_items, ingest_envelopes, project_policies, project_keys, projects CASCADE",
    );
    const config = loadRuntimeConfig({
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl!,
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379",
      PUBLIC_INGEST_URL: "http://127.0.0.1:3000",
      LOG_LEVEL: "fatal",
    });
    accessToken = createAccessToken(
      { id: "00000000-0000-4000-8000-000000000001", username: "root", email: "root@root.com" },
      config,
    );
    app = await createApp({ config, database });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    baseUrl = address;
  });

  afterAll(async () => {
    await app?.close();
    await database?.close();
  });

  it("accepts telemetry over HTTP and serves correlated trace/metric queries", async () => {
    const projectResponse = await fetch(`${baseUrl}/api/trpc/projects.create`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ slug: "http-e2e", name: "HTTP E2E" }),
    });
    expect(projectResponse.status).toBe(200);
    const projectBody = (await projectResponse.json()) as {
      result: { data: { project: { id: string; sentryProjectId: number }; dsn: string } };
    };
    const project = projectBody.result.data.project;
    const dsn = projectBody.result.data.dsn;
    // Keep telemetry timestamps safely behind the query-time upper bound;
    // network and processing latency must not make a sample appear in the
    // future relative to catalog/series defaults.
    const now = Date.now() / 1_000 - 2;
    const traceId = "d".repeat(32);
    const rootSpanId = "e".repeat(16);
    const childSpanId = "f".repeat(16);
    const transactionId = randomUUID().replaceAll("-", "");
    const envelope = [
      JSON.stringify({ event_id: transactionId, dsn }),
      JSON.stringify({ type: "transaction", content_type: "application/json" }),
      JSON.stringify({
        event_id: transactionId,
        transaction: "http.e2e.operation",
        start_timestamp: now,
        timestamp: now + 1,
        environment: "e2e",
        release: "e2e-test",
        contexts: {
          trace: { trace_id: traceId, span_id: rootSpanId, op: "http.server", status: "ok" },
        },
        spans: [
          {
            trace_id: traceId,
            span_id: childSpanId,
            parent_span_id: rootSpanId,
            description: "http.e2e.child",
            op: "db.query",
            start_timestamp: now + 0.1,
            timestamp: now + 0.5,
          },
        ],
      }),
      JSON.stringify({
        type: "trace_metric",
        item_count: 1,
        content_type: "application/vnd.sentry.items.trace-metric+json",
      }),
      JSON.stringify({
        version: 2,
        items: [
          {
            timestamp: now + 0.2,
            trace_id: traceId,
            span_id: rootSpanId,
            name: "http.e2e.latency",
            type: "distribution",
            unit: "millisecond",
            value: 42,
            attributes: { source: { value: "e2e", type: "string" } },
          },
        ],
      }),
      "",
    ].join("\n");

    const ingestResponse = await fetch(`${baseUrl}/api/${project.sentryProjectId}/envelope/`, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body: envelope,
    });
    expect(ingestResponse.status).toBe(200);
    // Transaction-only telemetry envelopes are acknowledged as {} because
    // Sentry responses only return an id when an event item is present.
    expect(await ingestResponse.json()).toEqual({});

    const items = await database.db.select().from(ingestItems);
    const transactionItem = items.find((item) => item.type === "transaction");
    const metricItem = items.find((item) => item.type === "trace_metric");
    expect(transactionItem).toBeDefined();
    expect(metricItem).toBeDefined();
    const processors = createItemProcessors(
      app.container.processing,
      app.container.replays,
      app.container.traces,
      app.container.metrics,
    );
    await processors["ingest.transaction"]!(transactionItem!.id);
    await processors["ingest.trace_metric"]!(metricItem!.id);

    const input = encodeURIComponent(JSON.stringify({ projectId: project.id }));
    const tracesResponse = await fetch(`${baseUrl}/api/trpc/traces.list?input=${input}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(tracesResponse.status).toBe(200);
    const tracesBody = (await tracesResponse.json()) as {
      result: { data: { data: Array<{ traceId: string; name: string }> } };
    };
    expect(tracesBody.result.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ traceId, name: "http.e2e.operation" })]),
    );

    const traceInput = encodeURIComponent(JSON.stringify({ projectId: project.id, traceId }));
    const traceResponse = await fetch(`${baseUrl}/api/trpc/traces.get?input=${traceInput}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(traceResponse.status).toBe(200);
    const traceBody = (await traceResponse.json()) as {
      result: {
        data: {
          roots: Array<{ name: string; children: Array<{ name: string }> }>;
          metricCount: number;
        };
      };
    };
    expect(traceBody.result.data.roots[0]).toMatchObject({
      name: "http.e2e.operation",
      children: [{ name: "http.e2e.child" }],
    });
    expect(traceBody.result.data.metricCount).toBe(1);

    const catalogInput = encodeURIComponent(
      JSON.stringify({ projectId: project.id, prefix: "http.e2e" }),
    );
    const catalogResponse = await fetch(
      `${baseUrl}/api/trpc/metrics.catalog?input=${catalogInput}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    expect(catalogResponse.status).toBe(200);
    const catalogBody = (await catalogResponse.json()) as {
      result: { data: { data: Array<{ name: string; sampleCount: number }> } };
    };
    expect(catalogBody.result.data.data).toEqual([
      expect.objectContaining({ name: "http.e2e.latency", sampleCount: 1 }),
    ]);

    const seriesInput = encodeURIComponent(
      JSON.stringify({
        projectId: project.id,
        name: "http.e2e.latency",
        type: "distribution",
        unit: "millisecond",
        resolution: "1m",
        attributes: { source: "e2e" },
      }),
    );
    const seriesResponse = await fetch(`${baseUrl}/api/trpc/metrics.series?input=${seriesInput}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(seriesResponse.status).toBe(200);
    const seriesBody = (await seriesResponse.json()) as {
      result: { data: { summary: { count: number; p95: number } } };
    };
    expect(seriesBody.result.data.summary).toMatchObject({ count: 1, p95: 42 });
  });
});
