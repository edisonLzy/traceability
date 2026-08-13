import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../../app.js";
import { loadRuntimeConfig } from "../../../config/index.js";
import { createAccessToken } from "../../../helper/auth.js";
import { createDatabase, type Database } from "../../../infrastructure/database/client.js";
import { inboxActivities, inboxItems } from "../../../modules/inbox/schema.js";
import { events, issues } from "../../../modules/issues/schema.js";
import { ProcessingRepository } from "../../../modules/processing/repository.js";
import { ProcessingService } from "../../../modules/processing/service.js";
import { ingestItems } from "../schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("PostgreSQL ingest integration", () => {
  let database: Database;
  let app: Awaited<ReturnType<typeof createApp>>;
  let accessToken: string;

  beforeAll(async () => {
    database = createDatabase({ connectionString: databaseUrl!, maxConnections: 2 });
    await database.db.execute(
      "TRUNCATE replay_segments, replay_sessions, events, issues, outbox, outcomes, ingest_items, ingest_envelopes, project_policies, project_keys, projects CASCADE",
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

  afterAll(async () => {
    await app?.close();
  });

  it("durably accepts, scrubs, processes, and deduplicates a Sentry event", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/trpc/projects.create",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      payload: { slug: "integration-web", name: "Integration Web" },
    });
    expect(projectResponse.statusCode).toBe(200);
    const created = projectResponse.json().result.data as {
      project: { id: string; sentryProjectId: number };
      dsn: string;
    };
    expect(created.dsn).toMatch(/^http:\/\/[a-f0-9]{32}@127\.0\.0\.1:3000\/\d+$/);
    const eventId = randomUUID().replaceAll("-", "");
    const envelope = [
      JSON.stringify({ event_id: eventId, dsn: created.dsn }),
      JSON.stringify({ type: "event", content_type: "application/json" }),
      JSON.stringify({
        event_id: eventId,
        level: "error",
        exception: {
          values: [
            {
              type: "TypeError",
              value:
                "email alice@example.com and token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature",
              stacktrace: { frames: [{ filename: "app.js", function: "render", in_app: true }] },
            },
          ],
        },
      }),
      "",
    ].join("\n");

    const accepted = await app.inject({
      method: "POST",
      url: `/api/${created.project.sentryProjectId}/envelope/`,
      headers: { "content-type": "application/x-sentry-envelope" },
      payload: envelope,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ id: eventId });

    const [item] = await database.db
      .select()
      .from(ingestItems)
      .where(eq(ingestItems.eventId, eventId));
    expect(item?.payloadJson).toMatchObject({
      exception: { values: [{ value: "email [Filtered Email] and token [Filtered JWT]" }] },
    });
    const processing = new ProcessingService(new ProcessingRepository(database));
    await processing.processEventItem(item!.id);
    await processing.processEventItem(item!.id);

    const storedEvents = await database.db.select().from(events).where(eq(events.eventId, eventId));
    const storedIssues = await database.db.select().from(issues);
    const storedInboxItems = await database.db.select().from(inboxItems);
    const storedInboxActivities = await database.db.select().from(inboxActivities);
    expect(storedEvents).toHaveLength(1);
    expect(storedIssues).toHaveLength(1);
    expect(storedIssues[0]?.eventCount).toBe(1);
    expect(storedInboxItems).toHaveLength(1);
    expect(storedInboxItems[0]).toMatchObject({
      issueId: storedIssues[0]?.id,
      state: "open",
      triggerReason: "New unresolved issue",
    });
    expect(storedInboxActivities).toHaveLength(1);
    expect(storedInboxActivities[0]).toMatchObject({
      inboxItemId: storedInboxItems[0]?.id,
      type: "created",
      actorType: "system",
    });

    const resolved = await app.inject({
      method: "POST",
      url: "/api/trpc/inbox.resolve",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify(storedInboxItems[0]!.id),
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().result.data).toMatchObject({
      item: { state: "done" },
      issue: { status: "resolved" },
    });

    const recurringEventId = randomUUID().replaceAll("-", "");
    const acceptedRecurring = await app.inject({
      method: "POST",
      url: `/api/${created.project.sentryProjectId}/envelope/`,
      headers: { "content-type": "application/x-sentry-envelope" },
      payload: envelope.replaceAll(eventId, recurringEventId),
    });
    expect(acceptedRecurring.statusCode).toBe(200);
    const [recurringItem] = await database.db
      .select()
      .from(ingestItems)
      .where(eq(ingestItems.eventId, recurringEventId));
    await processing.processEventItem(recurringItem!.id);

    const [regressedIssue] = await database.db.select().from(issues);
    const [regressedInboxItem] = await database.db.select().from(inboxItems);
    const activitiesAfterRegression = await database.db.select().from(inboxActivities);
    expect(regressedIssue).toMatchObject({ status: "unresolved", eventCount: 2 });
    expect(regressedInboxItem).toMatchObject({
      state: "open",
      triggerReason: "Issue recurred after being resolved",
    });
    expect(activitiesAfterRegression).toHaveLength(3);
    expect(activitiesAfterRegression).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "state_changed",
          actorType: "system",
          payload: expect.objectContaining({ reason: "issue_regressed" }),
        }),
      ]),
    );
  });
});
