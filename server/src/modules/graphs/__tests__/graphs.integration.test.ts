import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../../../infrastructure/database/client.js";
import { createRedisClient } from "../../../infrastructure/redis/client.js";
import { projects } from "../../projects/schema.js";
import { publishEvent } from "../../realtime/event-bus.js";
import { REALTIME_CHANNEL } from "../../realtime/types.js";
import { GraphRepository } from "../repository.js";
import { graphEventOutbox, graphNodes, graphOperations } from "../schema.js";
import { GraphService } from "../service.js";
import type { ApplyGraphOperationsInput } from "../types.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";
const describeIntegration = databaseUrl ? describe : describe.skip;

const ACTOR_ID = "00000000-0000-4000-8000-000000000001";

describeIntegration("graph", () => {
  let database: Database;
  let service: GraphService;
  let repository: GraphRepository;
  let projectId: string;

  beforeAll(async () => {
    database = createDatabase({ connectionString: databaseUrl!, maxConnections: 4 });
    repository = new GraphRepository(database);
    service = new GraphService(repository);
  });

  afterAll(async () => {
    await database?.close();
  });

  beforeEach(async () => {
    await database.db.execute(
      "TRUNCATE graph_event_outbox, graph_operations, graph_edges, graph_nodes, graphs, projects CASCADE",
    );
    projectId = randomUUID();
    await database.db.insert(projects).values({
      id: projectId,
      slug: `graph-${randomUUID()}`,
      name: "Graph test",
      platform: "javascript",
    });
  });

  function applyInput(
    graphId: string,
    operationId: string,
    operations: ApplyGraphOperationsInput["operations"],
    baseVersion = 0,
  ): ApplyGraphOperationsInput {
    return { operationId, graphId, baseVersion, actor: { type: "agent" }, operations };
  }

  async function seedPendingEvent(): Promise<void> {
    const created = await service.createGraph(projectId, "Outbox seed", ACTOR_ID);
    await service.applyOperations(
      projectId,
      applyInput(created.id, randomUUID(), [
        {
          op: "createNode",
          id: "q1",
          type: "question",
          position: { x: 0, y: 0 },
          data: { kind: "question", prompt: "why?" },
        },
      ]),
      ACTOR_ID,
    );
  }

  it("creates, lists, and reads a graph", async () => {
    const created = await service.createGraph(projectId, "First graph", ACTOR_ID);
    expect(created.projectId).toBe(projectId);
    expect(created.version).toBe(0);

    const list = await service.listGraphs(projectId);
    expect(list.map((g) => g.id)).toContain(created.id);

    const snapshot = await service.getGraph(projectId, created.id);
    expect(snapshot).toMatchObject({ id: created.id, version: 0, nodes: [], edges: [] });
  });

  it("does not expose a graph to a different project", async () => {
    const created = await service.createGraph(projectId, "Scoped", ACTOR_ID);
    const otherProjectId = randomUUID();
    await expect(service.getGraph(otherProjectId, created.id)).resolves.toBeNull();
    await expect(
      service.applyOperations(
        otherProjectId,
        applyInput(created.id, randomUUID(), [
          {
            op: "createNode",
            id: "q1",
            type: "question",
            position: { x: 0, y: 0 },
            data: { kind: "question", prompt: "why?" },
          },
        ]),
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("applies node and edge operations, resolving temp ids", async () => {
    const created = await service.createGraph(projectId, "Investigate", ACTOR_ID);

    const result = await service.applyOperations(
      projectId,
      applyInput(created.id, randomUUID(), [
        {
          op: "createNode",
          id: "q1",
          type: "question",
          position: { x: 0, y: 0 },
          data: { kind: "question", prompt: "why did it crash?" },
        },
        {
          op: "createNode",
          id: "i1",
          type: "issue",
          position: { x: 100, y: 0 },
          data: { kind: "issue", issueId: randomUUID() },
        },
        { op: "createEdge", id: "e1", source: "q1", target: "i1", relation: "investigates" },
      ]),
      ACTOR_ID,
    );

    expect(result.version).toBe(1);
    expect(result.alreadyApplied).toBe(false);
    expect(Object.keys(result.idMappings).sort()).toEqual(["i1", "q1"]);

    const snapshot = await service.getGraph(projectId, created.id);
    expect(snapshot!.nodes).toHaveLength(2);
    expect(snapshot!.edges).toHaveLength(1);
    expect(snapshot!.edges[0]).toMatchObject({
      source: result.idMappings["q1"],
      target: result.idMappings["i1"],
      data: { relation: "investigates" },
    });
  });

  it("returns alreadyApplied for a duplicate operationId without re-writing", async () => {
    const created = await service.createGraph(projectId, "Idempotent", ACTOR_ID);
    const operationId = randomUUID();
    const input = applyInput(created.id, operationId, [
      {
        op: "createNode",
        id: "q1",
        type: "question",
        position: { x: 0, y: 0 },
        data: { kind: "question", prompt: "why?" },
      },
    ]);

    const first = await service.applyOperations(projectId, input, ACTOR_ID);
    const second = await service.applyOperations(
      projectId,
      { ...input, baseVersion: 999 },
      ACTOR_ID,
    );

    expect(first.version).toBe(1);
    expect(second).toMatchObject({ version: 1, alreadyApplied: true });

    const rows = await database.db.select().from(graphNodes);
    expect(rows).toHaveLength(1);
  });

  it("rejects a stale baseVersion with a conflict", async () => {
    const created = await service.createGraph(projectId, "Concurrent", ACTOR_ID);
    await service.applyOperations(
      projectId,
      applyInput(created.id, randomUUID(), [
        {
          op: "createNode",
          id: "q1",
          type: "question",
          position: { x: 0, y: 0 },
          data: { kind: "question", prompt: "why?" },
        },
      ]),
      ACTOR_ID,
    );

    await expect(
      service.applyOperations(
        projectId,
        applyInput(created.id, randomUUID(), [
          {
            op: "createNode",
            id: "q2",
            type: "question",
            position: { x: 0, y: 0 },
            data: { kind: "question", prompt: "again?" },
          },
        ]),
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("records the operation and its outbox row in the same transaction", async () => {
    const created = await service.createGraph(projectId, "Recorded", ACTOR_ID);
    const operationId = randomUUID();
    await service.applyOperations(
      projectId,
      applyInput(created.id, operationId, [
        {
          op: "createNode",
          id: "q1",
          type: "question",
          position: { x: 0, y: 0 },
          data: { kind: "question", prompt: "why?" },
        },
      ]),
      ACTOR_ID,
    );

    const [operation] = await database.db.select().from(graphOperations);
    expect(operation).toMatchObject({
      operationId,
      graphVersion: 1,
      actorType: "agent",
      actorId: ACTOR_ID,
    });

    const [outboxRow] = await database.db.select().from(graphEventOutbox);
    expect(outboxRow).toMatchObject({ topic: "graph.operation.committed", status: "pending" });
    expect(outboxRow!.payload).toMatchObject({
      type: "graph.operation.committed",
      graphId: created.id,
      graphVersion: 1,
      operationId,
    });

    const operations = await service.getOperations(projectId, created.id, 0);
    expect(operations).toHaveLength(1);
    expect(operations[0]!.operations).toHaveLength(1);
  });

  it("claims, publishes, and delivers the committed event over Redis", async () => {
    const created = await service.createGraph(projectId, "Realtime", ACTOR_ID);
    const operationId = randomUUID();
    await service.applyOperations(
      projectId,
      applyInput(created.id, operationId, [
        {
          op: "createNode",
          id: "q1",
          type: "question",
          position: { x: 0, y: 0 },
          data: { kind: "question", prompt: "why?" },
        },
      ]),
      ACTOR_ID,
    );

    const [claimed] = await repository.claimPendingEvents(10);
    expect(claimed).toBeDefined();
    expect(claimed!.payload).toMatchObject({ graphId: created.id, graphVersion: 1, operationId });

    const subscriber = createRedisClient(redisUrl);
    const received: string[] = [];
    subscriber.on("message", (_channel, message) => received.push(message));
    await subscriber.subscribe(REALTIME_CHANNEL);

    await publishEvent(createRedisClient(redisUrl), REALTIME_CHANNEL, claimed!.payload);
    await waitFor(() => received.includes(JSON.stringify(claimed!.payload)));

    await repository.markEventPublished(claimed!.id, new Date());
    expect(await repository.claimPendingEvents(10)).toHaveLength(0);

    subscriber.disconnect();
  });

  it("releases the claim on retry", async () => {
    await seedPendingEvent();
    const [claimed] = await repository.claimPendingEvents(1);
    await repository.markEventRetry({
      id: claimed!.id,
      attempts: 1,
      availableAt: new Date(),
      failed: false,
    });

    const [row] = await database.db
      .select({ claimedAt: graphEventOutbox.claimedAt, status: graphEventOutbox.status })
      .from(graphEventOutbox)
      .where(eq(graphEventOutbox.id, claimed!.id));
    expect(row!.claimedAt).toBeNull();
    expect(row!.status).toBe("pending");
  });

  it("marks an event terminal after max attempts", async () => {
    await seedPendingEvent();
    const [claimed] = await repository.claimPendingEvents(1);
    await repository.markEventRetry({
      id: claimed!.id,
      attempts: 5,
      availableAt: new Date(),
      failed: true,
    });

    const [row] = await database.db
      .select({ status: graphEventOutbox.status })
      .from(graphEventOutbox)
      .where(eq(graphEventOutbox.id, claimed!.id));
    expect(row!.status).toBe("failed");
  });

  it("re-claims a record whose lease has expired", async () => {
    await seedPendingEvent();
    const [first] = await repository.claimPendingEvents(1);
    await database.db
      .update(graphEventOutbox)
      .set({ claimedAt: new Date(Date.now() - 120_000) })
      .where(eq(graphEventOutbox.id, first!.id));

    const second = await repository.claimPendingEvents(1);
    expect(second.map((record) => record.id)).toEqual([first!.id]);
  });

  it("respects available_at backoff", async () => {
    await seedPendingEvent();
    const [row] = await database.db.select({ id: graphEventOutbox.id }).from(graphEventOutbox);
    await database.db
      .update(graphEventOutbox)
      .set({ availableAt: new Date(Date.now() + 60_000) })
      .where(eq(graphEventOutbox.id, row!.id));

    expect(await repository.claimPendingEvents(1)).toHaveLength(0);
  });

  it("two concurrent claims never return the same record", async () => {
    const graph = await service.createGraph(projectId, "Concurrent claims", ACTOR_ID);
    await service.applyOperations(
      projectId,
      applyInput(graph.id, randomUUID(), [
        {
          op: "createNode",
          id: "q1",
          type: "question",
          position: { x: 0, y: 0 },
          data: { kind: "question", prompt: "why?" },
        },
      ]),
      ACTOR_ID,
    );
    await service.applyOperations(
      projectId,
      applyInput(
        graph.id,
        randomUUID(),
        [
          {
            op: "createNode",
            id: "q2",
            type: "question",
            position: { x: 0, y: 0 },
            data: { kind: "question", prompt: "again?" },
          },
        ],
        1,
      ),
      ACTOR_ID,
    );

    const [first, second] = await Promise.all([
      repository.claimPendingEvents(1),
      repository.claimPendingEvents(1),
    ]);
    expect(first.map((record) => record.id)).toHaveLength(1);
    expect(second.map((record) => record.id)).toHaveLength(1);
    expect(first[0]!.id).not.toBe(second[0]!.id);
  });

  it("cascades edge deletion when a node is deleted", async () => {
    const created = await service.createGraph(projectId, "Cascade", ACTOR_ID);
    const result = await service.applyOperations(
      projectId,
      applyInput(created.id, randomUUID(), [
        {
          op: "createNode",
          id: "q1",
          type: "question",
          position: { x: 0, y: 0 },
          data: { kind: "question", prompt: "why?" },
        },
        {
          op: "createNode",
          id: "i1",
          type: "issue",
          position: { x: 0, y: 0 },
          data: { kind: "issue", issueId: randomUUID() },
        },
        { op: "createEdge", id: "e1", source: "q1", target: "i1", relation: "investigates" },
      ]),
      ACTOR_ID,
    );

    await service.applyOperations(
      projectId,
      applyInput(created.id, randomUUID(), [{ op: "deleteNode", id: result.idMappings["q1"]! }], 1),
      ACTOR_ID,
    );

    const snapshot = await service.getGraph(projectId, created.id);
    expect(snapshot!.nodes).toHaveLength(1);
    expect(snapshot!.edges).toHaveLength(0);
  });

  it("rejects invalid operations", async () => {
    const created = await service.createGraph(projectId, "Validated", ACTOR_ID);

    await expect(
      service.applyOperations(
        projectId,
        applyInput(created.id, randomUUID(), [
          {
            op: "createNode",
            id: "b1",
            type: "bogus" as never,
            position: { x: 0, y: 0 },
            data: { kind: "question", prompt: "x" },
          },
        ]),
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      service.applyOperations(
        projectId,
        applyInput(created.id, randomUUID(), [
          {
            op: "createEdge",
            id: "e1",
            source: "missing",
            target: "also-missing",
            relation: "related_to",
          },
        ]),
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("archives and renames a graph", async () => {
    const created = await service.createGraph(projectId, "Old title", ACTOR_ID);

    const renamed = await service.renameGraph(projectId, created.id, "New title");
    expect(renamed.title).toBe("New title");

    const archived = await service.archiveGraph(projectId, created.id);
    expect(archived.status).toBe("archived");

    const snapshot = await service.getGraph(projectId, created.id);
    expect(snapshot!.status).toBe("archived");
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met within timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
