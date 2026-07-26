import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import type { RuntimeConfig } from "../../config/index.js";
import type { PostgresDatabase } from "../../db/postgres.js";
import type { Context } from "../context.js";
import { managementProcedure, t } from "../trpc.js";

function makeConfig(token: string): RuntimeConfig {
  return {
    environment: "development",
    host: "0.0.0.0",
    port: 3000,
    databaseUrl: "postgresql://x",
    databasePoolMax: 10,
    redisUrl: "redis://x",
    publicIngestUrl: "http://x",
    defaultOrganizationSlug: "traceability",
    defaultOrganizationName: "Traceability",
    managementAuthToken: token,
    ingestMaxCompressedBytes: 1024,
    ingestMaxDecompressedBytes: 1024,
    ingestMaxItems: 1,
    ingestMaxItemBytes: 1024,
    corsOrigins: [],
    trustProxy: false,
    logLevel: "info",
  };
}

function makeCtx(token: string, authHeader?: string): Context & { req: FastifyRequest } {
  return {
    config: makeConfig(token),
    database: {} as PostgresDatabase,
    services: {} as never,
    req: { headers: { authorization: authHeader } } as unknown as FastifyRequest,
  };
}

const testRouter = t.router({
  ping: managementProcedure.query(() => "pong"),
});

describe("managementProcedure", () => {
  it("rejects when the bearer token is missing", async () => {
    const caller = testRouter.createCaller(makeCtx("secret"));
    await expect(caller.ping()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a wrong bearer token", async () => {
    const caller = testRouter.createCaller(makeCtx("secret", "Bearer wrong"));
    await expect(caller.ping()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("accepts a matching bearer token", async () => {
    const caller = testRouter.createCaller(makeCtx("secret", "Bearer secret"));
    await expect(caller.ping()).resolves.toBe("pong");
  });
});
