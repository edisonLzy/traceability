import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../../app.js";
import { loadRuntimeConfig } from "../../../config/index.js";
import { createAccessToken } from "../../../helper/auth.js";
import { createDatabase, type Database } from "../../../infrastructure/database/client.js";
import { events, issues } from "../../issues/schema.js";
import { minidumps } from "../../minidumps/schema.js";
import { outbox, ingestItems } from "../schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("PostgreSQL minidump ingest integration", () => {
  let database: Database;
  let app: Awaited<ReturnType<typeof createApp>>;
  let accessToken: string;

  beforeAll(async () => {
    database = createDatabase({ connectionString: databaseUrl!, maxConnections: 2 });
    await database.db.execute(
      "TRUNCATE minidumps, replay_segments, replay_sessions, events, issues, outbox, outcomes, ingest_items, ingest_envelopes, project_policies, project_keys, projects CASCADE",
    );
    const config = loadRuntimeConfig({
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl!,
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
      PUBLIC_INGEST_URL: "http://127.0.0.1:3000",
      OBJECT_STORAGE_ENDPOINT: process.env.TEST_OBJECT_STORAGE_URL ?? "http://127.0.0.1:9000",
      LOG_LEVEL: "fatal",
    });
    accessToken = createAccessToken(
      { id: "00000000-0000-4000-8000-000000000001", username: "root", email: "root@root.com" },
      config,
    );
    app = await createApp({ config, database });
  });

  afterAll(async () => {
    await app?.close();
  });

  it("accepts, aggregates, stores, lists, and downloads an Electron native crash", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/trpc/projects.create",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      payload: { slug: "native-crash-test", name: "Native Crash Test", platform: "javascript" },
    });
    expect(projectResponse.statusCode).toBe(200);
    const created = projectResponse.json().result.data as {
      project: { id: string; sentryProjectId: number };
      dsn: string;
    };

    const eventId = randomUUID().replaceAll("-", "");
    const dump = Buffer.concat([Buffer.from("MDMP"), Buffer.alloc(1_100_000, 0x2a)]);
    const accepted = await app.inject({
      method: "POST",
      url: `/api/${created.project.sentryProjectId}/envelope/`,
      headers: { "content-type": "application/x-sentry-envelope" },
      payload: nativeEnvelope(created.dsn, eventId, dump),
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json()).toEqual({ id: eventId });

    const jobs = await database.db.select().from(outbox).orderBy(outbox.createdAt);
    const eventJob = jobs.find((job) => job.topic === "ingest.event");
    const dumpJob = jobs.find((job) => job.topic === "ingest.attachment");
    expect(eventJob).toBeTruthy();
    expect(dumpJob).toBeTruthy();

    await app.container.processing.processEventItem(eventJob!.itemId);
    await app.container.minidumps.processAttachmentItem(dumpJob!.itemId);

    const [storedEvent] = await database.db
      .select()
      .from(events)
      .where(eq(events.eventId, eventId));
    const [storedIssue] = await database.db.select().from(issues);
    const [storedDump] = await database.db
      .select()
      .from(minidumps)
      .where(eq(minidumps.eventId, eventId));
    const [attachmentItem] = await database.db
      .select()
      .from(ingestItems)
      .where(eq(ingestItems.id, dumpJob!.itemId));

    expect(storedEvent?.payload).toMatchObject({ platform: "native", level: "fatal" });
    expect(storedIssue).toMatchObject({
      title: "NativeCrash: browser process crashed (crashed)",
      type: "native_crash",
      eventCount: 1,
    });
    expect(storedDump).toMatchObject({ eventId, sizeBytes: dump.byteLength });
    expect(attachmentItem).toMatchObject({ status: "processed", payload: null });

    const listResponse = await withTimeout(
      app.inject({
        method: "GET",
        url: `/api/trpc/minidumps.listForEvent?input=${encodeURIComponent(
          JSON.stringify({ projectId: created.project.id, eventId }),
        )}`,
        headers: { authorization: `Bearer ${accessToken}` },
      }),
      "minidump metadata query",
    );
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().result.data).toMatchObject([{ id: storedDump!.id, eventId }]);

    const issueListResponse = await withTimeout(
      app.inject({
        method: "GET",
        url: `/api/trpc/minidumps.listForIssue?input=${encodeURIComponent(
          JSON.stringify(storedIssue!.id),
        )}`,
        headers: { authorization: `Bearer ${accessToken}` },
      }),
      "issue minidump metadata query",
    );
    expect(issueListResponse.statusCode).toBe(200);
    expect(issueListResponse.json().result.data).toMatchObject([{ id: storedDump!.id, eventId }]);

    const serviceDownload = await withTimeout(
      app.container.minidumps.download(storedDump!.id),
      "minidump service download",
    );
    expect(serviceDownload?.body).toEqual(dump);

    const downloadResponse = await withTimeout(
      app.inject({
        method: "GET",
        url: `/api/minidumps/${storedDump!.id}/download`,
        headers: { authorization: `Bearer ${accessToken}` },
      }),
      "minidump download",
    );
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.rawPayload).toEqual(dump);
  }, 20_000);
});

function nativeEnvelope(dsn: string, eventId: string, dump: Buffer): Buffer {
  const event = Buffer.from(
    JSON.stringify({
      event_id: eventId,
      platform: "native",
      level: "fatal",
      tags: {
        "event.environment": "native",
        "event.process": "browser",
        "exit.reason": "crashed",
      },
    }),
  );
  return Buffer.concat([
    Buffer.from(
      [
        JSON.stringify({ event_id: eventId, dsn }),
        JSON.stringify({ type: "event", content_type: "application/json", length: event.length }),
        "",
      ].join("\n"),
    ),
    event,
    Buffer.from("\n"),
    Buffer.from(
      `${JSON.stringify({
        type: "attachment",
        attachment_type: "event.minidump",
        content_type: "application/x-dmp",
        filename: "native.dmp",
        length: dump.byteLength,
      })}\n`,
    ),
    dump,
  ]);
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), 5_000);
    }),
  ]).finally(() => clearTimeout(timer));
}
