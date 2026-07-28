import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../infrastructure/database/client.js";

const config: RuntimeConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 3000,
  databaseUrl: "postgresql://unused",
  databasePoolMax: 1,
  redisUrl: "redis://127.0.0.1:6379",
  publicIngestUrl: "http://127.0.0.1:3000",
  managementAuthToken: "traceability-development-token",
  ingestMaxCompressedBytes: 1_048_576,
  ingestMaxDecompressedBytes: 5_242_880,
  ingestMaxItems: 20,
  ingestMaxItemBytes: 1_048_576,
  corsOrigins: [],
  trustProxy: false,
  logLevel: "fatal",
};

describe("runtime app", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  /** Swap the ingest service's rate limiter with a mock to avoid Redis in tests. */
  function mockRateLimiter(app: Awaited<ReturnType<typeof createApp>>) {
    app.container.ingest.rateLimiter = {
      consume: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
      check: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
  }

  it("reports liveness without querying PostgreSQL", async () => {
    const database = createDatabase();
    const app = await createApp({ config, database });
    mockRateLimiter(app);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(database.ping).not.toHaveBeenCalled();
  });

  it("serves the tRPC panel outside production", async () => {
    const app = await createApp({ config, database: createDatabase() });
    mockRateLimiter(app);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/trpc-panel" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("tRPC.ui()");
    expect(response.body).toContain("/api/trpc");
  });

  it("does not register the tRPC panel in production", async () => {
    const app = await createApp({
      config: { ...config, environment: "production", managementAuthToken: "production-token" },
      database: createDatabase(),
    });
    mockRateLimiter(app);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/trpc-panel" });

    expect(response.statusCode).toBe(404);
  });

  it("reports readiness only when PostgreSQL is reachable", async () => {
    const database = createDatabase();
    const app = await createApp({ config, database });
    mockRateLimiter(app);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(database.ping).toHaveBeenCalledOnce();
  });

  it("returns 503 when PostgreSQL is unreachable", async () => {
    const database = createDatabase({ pingError: new Error("connection refused") });
    const app = await createApp({ config, database });
    mockRateLimiter(app);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });
  });

  it("rejects unauthenticated management requests", async () => {
    const database = createDatabase();
    const app = await createApp({ config, database });
    mockRateLimiter(app);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/trpc/projects.list",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.data.code).toBe("UNAUTHORIZED");
  });

  it("protects metrics and returns Prometheus metrics for management callers", async () => {
    const app = await createApp({ config, database: createDatabase() });
    mockRateLimiter(app);
    apps.push(app);

    const unauthenticated = await app.inject({ method: "GET", url: "/metrics" });
    expect(unauthenticated.statusCode).toBe(401);

    await app.inject({ method: "GET", url: "/health/live" });
    const response = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: `Bearer ${config.managementAuthToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("traceability_http_requests_total");
  });

  it("keeps ingest content parsers scoped away from sibling routes", async () => {
    const app = await createApp({ config, database: createDatabase() });
    mockRateLimiter(app);
    apps.push(app);
    app.post("/echo-text", async (request) => ({
      body: request.body,
      isBuffer: Buffer.isBuffer(request.body),
    }));

    const response = await app.inject({
      method: "POST",
      url: "/echo-text",
      headers: { "content-type": "text/plain" },
      payload: "hello",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: "hello", isBuffer: false });
  });
});

function createDatabase(options: { pingError?: Error } = {}): Database {
  return {
    db: {} as Database["db"],
    close: vi.fn(async () => undefined),
    ping: options.pingError
      ? vi.fn(async () => {
          throw options.pingError;
        })
      : vi.fn(async () => undefined),
  };
}
