import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../../../infrastructure/database/client.js";
import { projectKeys, projects } from "../../projects/schema.js";
import { IngestRepository, type PreparedItem, type ProjectContext } from "../repository.js";
import { outbox } from "../schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("outbox claim (FOR UPDATE SKIP LOCKED)", () => {
  let database: Database;
  let repository: IngestRepository;
  let projectId: string;
  let keyId: string;

  beforeAll(async () => {
    database = createDatabase({ connectionString: databaseUrl!, maxConnections: 4 });
    repository = new IngestRepository(database);
  });

  afterAll(async () => {
    await database?.close();
  });

  beforeEach(async () => {
    await database.db.execute(
      "TRUNCATE outbox, outcomes, ingest_items, ingest_envelopes, project_keys, project_policies, projects CASCADE",
    );
    projectId = randomUUID();
    keyId = randomUUID();
    await database.db.insert(projects).values({
      id: projectId,
      slug: `claim-${randomUUID()}`,
      name: "Claim test",
      platform: "javascript",
    });
    await database.db.insert(projectKeys).values({
      id: keyId,
      projectId,
      publicKey: `pk-claim-${randomUUID()}`,
    });
  });

  function projectContext(): ProjectContext {
    return {
      projectId,
      projectKeyId: keyId,
      allowedOrigins: [],
      enabledItemTypes: ["event"],
      rateLimitPerSecond: 100,
    };
  }

  async function insertPendingItems(count: number): Promise<string[]> {
    const items: PreparedItem[] = Array.from({ length: count }, (_, i) => ({
      sequence: i,
      type: "event",
      header: {},
      payload: null,
      payloadJson: { event_id: randomUUID() },
      eventId: randomUUID(),
      status: "pending",
      errorCode: null,
    }));
    await repository.persist({
      project: projectContext(),
      sentAt: null,
      checksum: randomUUID(),
      sanitizedEnvelope: Buffer.from("envelope"),
      items,
    });
    const rows = await database.db.select({ id: outbox.id }).from(outbox);
    return rows.map((row) => row.id);
  }

  it("claims due pending records and stamps claimed_at", async () => {
    const ids = await insertPendingItems(2);
    const claimed = await repository.claimPendingOutbox(10);
    expect(new Set(claimed.map((record) => record.id))).toEqual(new Set(ids));
    const rows = await database.db.select({ claimedAt: outbox.claimedAt }).from(outbox);
    expect(rows.every((row) => row.claimedAt !== null)).toBe(true);
  });

  it("two concurrent claims never return the same record", async () => {
    await insertPendingItems(4);
    const [first, second] = await Promise.all([
      repository.claimPendingOutbox(2),
      repository.claimPendingOutbox(2),
    ]);
    const firstIds = new Set(first.map((record) => record.id));
    const secondIds = new Set(second.map((record) => record.id));
    expect(firstIds.size).toBe(2);
    expect(secondIds.size).toBe(2);
    for (const id of firstIds) expect(secondIds.has(id)).toBe(false);
  });

  it("does not re-claim a record another claim already holds", async () => {
    await insertPendingItems(2);
    const first = await repository.claimPendingOutbox(1);
    const second = await repository.claimPendingOutbox(1);
    expect(first.map((record) => record.id)).toHaveLength(1);
    expect(second.map((record) => record.id)).toHaveLength(1);
    expect(second[0]!.id).not.toBe(first[0]!.id);
  });

  it("re-claims a record whose lease has expired", async () => {
    const [id] = await insertPendingItems(1);
    await repository.claimPendingOutbox(1);
    await database.db
      .update(outbox)
      .set({ claimedAt: new Date(Date.now() - 120_000) })
      .where(eq(outbox.id, id!));
    const claimed = await repository.claimPendingOutbox(1);
    expect(claimed.map((record) => record.id)).toEqual([id]);
  });

  it("releases the claim on retry so backoff is not throttled by the lease", async () => {
    const [id] = await insertPendingItems(1);
    await repository.claimPendingOutbox(1);
    await repository.markOutboxRetry({
      id: id!,
      attempts: 1,
      availableAt: new Date(),
      failed: false,
    });
    const rows = await database.db
      .select({ claimedAt: outbox.claimedAt })
      .from(outbox)
      .where(eq(outbox.id, id!));
    expect(rows[0]?.claimedAt).toBeNull();
  });

  it("does not claim published records", async () => {
    const [id] = await insertPendingItems(1);
    await repository.claimPendingOutbox(1);
    await repository.markOutboxPublished(id!, new Date());
    expect(await repository.claimPendingOutbox(1)).toHaveLength(0);
  });

  it("respects available_at backoff", async () => {
    const [id] = await insertPendingItems(1);
    await database.db
      .update(outbox)
      .set({ availableAt: new Date(Date.now() + 60_000) })
      .where(eq(outbox.id, id!));
    expect(await repository.claimPendingOutbox(1)).toHaveLength(0);
  });
});
