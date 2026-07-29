import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../../app.js";
import { loadRuntimeConfig } from "../../../config/index.js";
import { createDatabase, type Database } from "../../../infrastructure/database/client.js";
import { outbox } from "../../ingest/schema.js";
import { ReplayRepository } from "../../replays/repository.js";
import { replaySessions, replaySegments } from "../../replays/schema.js";
import { ReplayService } from "../../replays/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("PostgreSQL replay ingest integration", () => {
  let database: Database;
  let app: Awaited<ReturnType<typeof createApp>>;
  const managementToken = "integration-management-token";

  beforeAll(async () => {
    database = createDatabase({ connectionString: databaseUrl!, maxConnections: 2 });
    // Include replay tables in cascade truncation
    await database.db.execute(
      "TRUNCATE replay_segments, replay_sessions, events, issues, outbox, outcomes, ingest_items, ingest_envelopes, project_policies, project_keys, projects CASCADE",
    );
    const config = loadRuntimeConfig({
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl!,
      REDIS_URL: "redis://127.0.0.1:6379",
      PUBLIC_INGEST_URL: "http://127.0.0.1:3000",
      MANAGEMENT_AUTH_TOKEN: managementToken,
      LOG_LEVEL: "fatal",
    });
    app = await createApp({ config, database });
  });

  afterAll(async () => {
    await app?.close();
  });

  it("accepts, persists, and processes replay items through the envelope pipeline", async () => {
    // 1. Create a project
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/trpc/projects.create",
      headers: {
        authorization: `Bearer ${managementToken}`,
        "content-type": "application/json",
      },
      payload: { slug: "replay-test", name: "Replay Test" },
    });
    expect(projectResponse.statusCode).toBe(200);
    const created = projectResponse.json().result.data as {
      project: { id: string; sentryProjectId: number };
      dsn: string;
    };

    // 2. Update project policy to enable replay item types
    const policyResponse = await app.inject({
      method: "POST",
      url: "/api/trpc/projects.updatePolicy",
      headers: {
        authorization: `Bearer ${managementToken}`,
        "content-type": "application/json",
      },
      payload: {
        projectId: created.project.id,
        patch: {
          allowedOrigins: [],
          rateLimitPerSecond: 100,
          enabledItemTypes: ["event", "replay_event", "replay_recording"],
          scrubRules: {},
        },
      },
    });
    expect(policyResponse.statusCode).toBe(200);

    // 3. Build a replay envelope
    const replayId = randomUUID().replaceAll("-", "");
    // Recording payload format: {"segment_id":0}\n[rrweb events]
    const segment0Events = JSON.stringify([{ type: 2, data: {}, timestamp: Date.now() }]);
    const segment0Payload = Buffer.from(`{"segment_id":0}\n${segment0Events}`);

    // replay_recording items use length-delimited binary payloads
    const segment0Len = segment0Payload.byteLength;

    const envelope = [
      JSON.stringify({ event_id: replayId, dsn: created.dsn }),
      // replay_event: session metadata
      JSON.stringify({
        type: "replay_event",
        content_type: "application/json",
        length: JSON.stringify({
          type: "replay_event",
          replay_id: replayId,
          replay_start_timestamp: Date.now() / 1000,
          timestamp: Date.now() / 1000,
          segment_id: 0,
          replay_type: "session",
          platform: "javascript",
          urls: ["http://localhost:5173/"],
          error_ids: [],
          trace_ids: [],
        }).length,
      }),
      JSON.stringify({
        type: "replay_event",
        replay_id: replayId,
        replay_start_timestamp: Date.now() / 1000,
        timestamp: Date.now() / 1000,
        segment_id: 0,
        replay_type: "session",
        platform: "javascript",
        urls: ["http://localhost:5173/"],
        error_ids: [],
        trace_ids: [],
      }),
      // replay_recording: binary payload with length header
      JSON.stringify({ type: "replay_recording", length: segment0Len }),
      "",
    ].join("\n");

    // Concatenate the binary payload after the newline-delimited envelope
    const envelopeBuffer = Buffer.concat([Buffer.from(envelope), segment0Payload]);

    // 4. Send the envelope
    const accepted = await app.inject({
      method: "POST",
      url: `/api/${created.project.sentryProjectId}/envelope/`,
      headers: { "content-type": "application/x-sentry-envelope" },
      payload: envelopeBuffer,
    });
    expect(accepted.statusCode).toBe(200);
    // Replay-only envelopes return {} since the response only reports event item IDs

    // 5. Verify outbox records were created
    const outboxRows = await database.db.select().from(outbox).orderBy(outbox.createdAt);
    const topics = outboxRows.map((row) => row.topic);
    expect(topics).toContain("ingest.replay_event");
    expect(topics).toContain("ingest.replay_recording");

    // 6. Process replay items through the replay service (simulating worker)
    const replayRepo = new ReplayRepository(database);
    const stubStorage = {
      put: async () => undefined,
      get: async () => Buffer.alloc(0),
      delete: async () => undefined,
      ping: async () => undefined,
      close: async () => undefined,
    };
    const replayService = new ReplayService(replayRepo, stubStorage as never);

    const replayEventRow = outboxRows.find((r) => r.topic === "ingest.replay_event");
    const replayRecordingRow = outboxRows.find((r) => r.topic === "ingest.replay_recording");
    expect(replayEventRow).toBeTruthy();
    expect(replayRecordingRow).toBeTruthy();

    await replayService.processReplayEventItem(replayEventRow!.itemId);
    await replayService.processReplayRecordingItem(replayRecordingRow!.itemId);

    // 7. Verify session row was created
    const sessions = await database.db
      .select()
      .from(replaySessions)
      .where(eq(replaySessions.replayId, replayId));
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    expect(session?.replayType).toBe("session");
    expect(session?.platform).toBe("javascript");
    expect(session?.urlList).toEqual(["http://localhost:5173/"]);
    expect(session?.segmentCount).toBe(1);

    // 8. Verify segment row was created (with storage key pointing to stub)
    const segments = await database.db
      .select()
      .from(replaySegments)
      .where(eq(replaySegments.replayId, session!.id));
    expect(segments).toHaveLength(1);
    expect(segments[0]?.segmentId).toBe(0);
    expect(segments[0]?.storageKey).toMatch(/^replays\//);

    // 9. Verify tRPC replay queries work
    const listResponse = await app.inject({
      method: "GET",
      url: `/api/trpc/replays.list?input=${encodeURIComponent(
        JSON.stringify({ projectId: created.project.id }),
      )}`,
      headers: { authorization: `Bearer ${managementToken}` },
    });
    expect(listResponse.statusCode).toBe(200);

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/trpc/replays.get?input=${encodeURIComponent(
        JSON.stringify({ projectId: created.project.id, replayId }),
      )}`,
      headers: { authorization: `Bearer ${managementToken}` },
    });
    expect(getResponse.statusCode).toBe(200);
    const detail = getResponse.json().result.data as {
      session: { replayId: string; segmentCount: number };
      segments: Array<{ segmentId: number }>;
    };
    expect(detail.session.replayId).toBe(replayId);
    expect(detail.segments).toHaveLength(1);
  });
});
