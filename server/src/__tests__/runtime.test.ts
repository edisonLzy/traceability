import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { RuntimeConfig } from "../config/index.js";
import type { PostgresDatabase } from "../db/postgres.js";

const config: RuntimeConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 3000,
  databaseUrl: "postgresql://unused",
  databasePoolMax: 1,
  redisUrl: "redis://127.0.0.1:6379",
  publicIngestUrl: "http://127.0.0.1:3000",
  defaultOrganizationSlug: "traceability",
  defaultOrganizationName: "Traceability",
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

  it("reports liveness without querying PostgreSQL", async () => {
    const database = createDatabase();
    const app = await createApp({ config, database });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(database.ping).not.toHaveBeenCalled();
  });

  it("serves the OpenAPI document and Swagger UI shell", async () => {
    const app = await createApp({ config, database: createDatabase() });
    apps.push(app);

    const document = await app.inject({ method: "GET", url: "/api-docs.json" });
    const ui = await app.inject({ method: "GET", url: "/api-docs" });

    expect(document.statusCode).toBe(200);
    expect(document.json().openapi).toBe("3.0.3");
    expect(document.json().paths["/api/trpc/{procedure}"]).toBeDefined();
    expect(ui.statusCode).toBe(200);
    expect(ui.body).toContain("swagger-ui");
  });

  it("serves the tRPC panel outside production", async () => {
    const app = await createApp({ config, database: createDatabase() });
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
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/trpc-panel" });

    expect(response.statusCode).toBe(404);
  });

  it("reports readiness only when PostgreSQL is reachable", async () => {
    const database = createDatabase();
    const app = await createApp({ config, database });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(database.ping).toHaveBeenCalledOnce();
  });

  it("returns 503 when PostgreSQL is unreachable", async () => {
    const database = createDatabase({ pingError: new Error("connection refused") });
    const app = await createApp({ config, database });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });
  });

  it("rejects unauthenticated management requests", async () => {
    const database = createDatabase();
    const app = await createApp({ config, database });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/trpc/projects.list",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.data.code).toBe("UNAUTHORIZED");
  });
});

function createDatabase(options: { pingError?: Error } = {}): PostgresDatabase {
  return {
    db: {} as PostgresDatabase["db"],
    close: vi.fn(async () => undefined),
    ping: options.pingError
      ? vi.fn(async () => {
          throw options.pingError;
        })
      : vi.fn(async () => undefined),
  };
}
