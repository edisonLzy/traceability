import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import type { RuntimeConfig } from "../../config/index.js";
import { createAccessToken } from "../../helper/auth.js";
import type { Database } from "../../infrastructure/database/client.js";
import type { Context } from "../context.js";
import { procedure, t } from "../trpc.js";

function makeConfig(secret: string): RuntimeConfig {
  return {
    environment: "development",
    host: "0.0.0.0",
    port: 3000,
    databaseUrl: "postgresql://x",
    databasePoolMax: 10,
    redisUrl: "redis://x",
    publicIngestUrl: "http://x",
    jwtSecret: secret,
    jwtAccessTokenTtlSeconds: 900,
    ingestMaxCompressedBytes: 1024,
    ingestMaxDecompressedBytes: 1024,
    ingestMaxItems: 1,
    ingestMaxItemBytes: 1024,
    corsOrigins: [],
    trustProxy: false,
    logLevel: "info",
    objectStorageEndpoint: "http://127.0.0.1:9000",
    objectStorageRegion: "us-east-1",
    objectStorageBucket: "traceability-sourcemaps",
    objectStorageAccessKey: "traceability",
    objectStorageSecretKey: "traceability-development-secret",
    sourcemapMaxBytes: 20_971_520,
    replayMaxRecordingBytes: 10_485_760,
  };
}

function makeCtx(secret: string, authHeader?: string): Context & { req: FastifyRequest } {
  return {
    config: makeConfig(secret),
    database: {} as Database,
    container: {} as never,
    req: { headers: { authorization: authHeader } } as unknown as FastifyRequest,
  };
}

const testRouter = t.router({
  ping: procedure.query(() => "pong"),
});

describe("procedure", () => {
  it("rejects when the bearer token is missing", async () => {
    const caller = testRouter.createCaller(makeCtx("secret"));
    await expect(caller.ping()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a wrong bearer token", async () => {
    const caller = testRouter.createCaller(makeCtx("secret", "Bearer wrong"));
    await expect(caller.ping()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("accepts a signed access token", async () => {
    const secret = "a secure secret that contains at least thirty-two characters";
    const token = createAccessToken(
      {
        id: "00000000-0000-4000-8000-000000000001",
        username: "root",
        email: "root@root.com",
      },
      { jwtSecret: secret, jwtAccessTokenTtlSeconds: 900 },
    );
    const caller = testRouter.createCaller(makeCtx(secret, `Bearer ${token}`));
    await expect(caller.ping()).resolves.toBe("pong");
  });
});
