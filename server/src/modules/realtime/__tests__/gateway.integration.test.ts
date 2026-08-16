import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createApp } from "../../../app.js";
import { loadRuntimeConfig } from "../../../config/index.js";
import { createDatabase, type Database } from "../../../infrastructure/database/client.js";
import { createRedisClient } from "../../../infrastructure/redis/client.js";
import type { GraphCommittedEvent } from "../../graphs/types.js";
import { projects } from "../../projects/schema.js";
import { publishEvent } from "../event-bus.js";
import { REALTIME_CHANNEL } from "../types.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";
const describeIntegration = databaseUrl && process.env.TEST_REDIS_URL ? describe : describe.skip;

const USER_ID = "00000000-0000-4000-8000-000000000001";

describeIntegration("realtime gateway", () => {
  let database: Database;
  let app: Awaited<ReturnType<typeof createApp>>;
  let publisher: ReturnType<typeof createRedisClient>;
  let baseUrl: string;
  let projectId: string;
  let graphId: string;

  beforeAll(async () => {
    database = createDatabase({ connectionString: databaseUrl!, maxConnections: 4 });
    const config = loadRuntimeConfig({
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      PUBLIC_INGEST_URL: "http://127.0.0.1:3000",
      LOG_LEVEL: "fatal",
    });
    app = await createApp({ config, database });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as { port: number };
    baseUrl = `ws://127.0.0.1:${address.port}/api/realtime`;
    publisher = createRedisClient(redisUrl);
  });

  afterAll(async () => {
    publisher?.disconnect();
    await app?.close();
    await database?.close();
  });

  beforeEach(async () => {
    await database.db.execute(
      "TRUNCATE graph_event_outbox, graph_operations, graph_edges, graph_nodes, graphs, projects CASCADE",
    );
    projectId = randomUUID();
    await database.db.insert(projects).values({
      id: projectId,
      slug: `ws-${randomUUID()}`,
      name: "Realtime gateway",
      platform: "javascript",
    });
    graphId = (await app.container.graphs.createGraph(projectId, "Gateway graph", USER_ID)).id;
  });

  it("closes the connection with 1008 for an invalid ticket", async () => {
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${baseUrl}?ticket=not-a-valid-ticket`);
      const timer = setTimeout(() => {
        ws.terminate();
        resolve(-1);
      }, 3_000);
      ws.on("close", (closeCode) => {
        clearTimeout(timer);
        resolve(closeCode);
      });
      ws.on("error", () => {
        clearTimeout(timer);
        resolve(-1);
      });
    });
    expect(code).toBe(1008);
  });

  it("subscribes and receives a committed event", async () => {
    const { ticket } = await app.container.realtime.createTicket(USER_ID);
    const ws = new WebSocket(`${baseUrl}?ticket=${ticket}`);
    const messages: Array<Record<string, unknown>> = [];
    ws.on("message", (data) =>
      messages.push(JSON.parse(data.toString()) as Record<string, unknown>),
    );

    await waitFor(() => ws.readyState === WebSocket.OPEN);
    ws.send(JSON.stringify({ type: "subscribe", projectId, graphId }));
    await waitFor(() => messages.some((message) => message.type === "subscribed"));

    const event: GraphCommittedEvent = {
      type: "graph.operation.committed",
      graphId,
      graphVersion: 1,
      operationId: randomUUID(),
      operations: [
        {
          op: "createNode",
          id: "q1",
          type: "question",
          position: { x: 0, y: 0 },
          data: { kind: "question", prompt: "why?" },
        },
      ],
    };
    await publishEvent(publisher, REALTIME_CHANNEL, event);
    await waitFor(() =>
      messages.some(
        (message) => message.type === "graph.operation.committed" && message.graphId === graphId,
      ),
    );

    ws.close();
  });

  it("rejects a subscribe to a graph in another project", async () => {
    const { ticket } = await app.container.realtime.createTicket(USER_ID);
    const ws = new WebSocket(`${baseUrl}?ticket=${ticket}`);
    const messages: Array<Record<string, unknown>> = [];
    ws.on("message", (data) =>
      messages.push(JSON.parse(data.toString()) as Record<string, unknown>),
    );

    await waitFor(() => ws.readyState === WebSocket.OPEN);
    ws.send(JSON.stringify({ type: "subscribe", projectId: randomUUID(), graphId }));
    await waitFor(() => messages.some((message) => message.type === "error"));

    ws.close();
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met within timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
