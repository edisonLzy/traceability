import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { loadRuntimeConfig } from "../../config/index.js";
import { createPostgresDatabase, type PostgresDatabase } from "../../db/postgres.js";
import { events, ingestItems, issues } from "../../db/schema/index.js";
import { processEventItem } from "../../domains/processing/event-handler.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("PostgreSQL ingest integration", () => {
  let database: PostgresDatabase;
  let app: Awaited<ReturnType<typeof createApp>>;
  const managementToken = "integration-management-token";

  beforeAll(async () => {
    database = createPostgresDatabase({ connectionString: databaseUrl!, maxConnections: 2 });
    await database.db.execute(
      "TRUNCATE events, issues, outbox, outcomes, ingest_items, ingest_envelopes, project_policies, project_keys, projects, organizations CASCADE",
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

  it("durably accepts, scrubs, processes, and deduplicates a Sentry event", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/trpc/projects.create",
      headers: {
        authorization: `Bearer ${managementToken}`,
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
    await processEventItem(database, item!.id);
    await processEventItem(database, item!.id);

    const storedEvents = await database.db.select().from(events).where(eq(events.eventId, eventId));
    const storedIssues = await database.db.select().from(issues);
    expect(storedEvents).toHaveLength(1);
    expect(storedIssues).toHaveLength(1);
    expect(storedIssues[0]?.eventCount).toBe(1);
  });
});
