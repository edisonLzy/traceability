import Fastify from "fastify";
import fastifyPlugin from "fastify-plugin";
import type IORedis from "ioredis";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../../config/index.js";
import type { Database } from "../../infrastructure/database/client.js";
import type { ObjectStorage } from "../../infrastructure/object-storage/client.js";
import { configPlugin } from "../config.js";
import { containerPlugin } from "../container.js";
import { databasePlugin } from "../database.js";

const stubObjectStorage: ObjectStorage = {
  put: vi.fn(async () => undefined),
  get: vi.fn(async () => Buffer.alloc(0)),
  delete: vi.fn(async () => undefined),
  ping: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
};

const stubObjectStoragePlugin = fastifyPlugin(
  async (app) => {
    app.decorate("objectStorage", stubObjectStorage);
  },
  { name: "object-storage" },
);

const stubRedisPlugin = fastifyPlugin(
  async (app) => {
    app.decorate("redis", { quit: vi.fn(async () => undefined) } as unknown as IORedis);
  },
  { name: "redis" },
);

describe("application container plugin", () => {
  it("creates one immutable container for the API process", async () => {
    const app = Fastify();
    const config = {
      publicIngestUrl: "http://127.0.0.1:3000",
      ingestMaxDecompressedBytes: 5_242_880,
      ingestMaxItems: 20,
      ingestMaxItemBytes: 1_048_576,
      replayMaxRecordingBytes: 10_485_760,
      minidumpMaxBytes: 20_971_520,
      redisUrl: "redis://127.0.0.1:6379",
    } as RuntimeConfig;
    const database = {
      db: {} as Database["db"],
      ping: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } satisfies Database;

    await app.register(configPlugin, { config });
    await app.register(databasePlugin, { database });
    await app.register(stubObjectStoragePlugin);
    await app.register(stubRedisPlugin);
    await app.register(containerPlugin);
    await app.ready();

    expect(Object.keys(app.container).sort()).toEqual([
      "auth",
      "graphs",
      "inbox",
      "ingest",
      "issues",
      "metrics",
      "minidumps",
      "processing",
      "projects",
      "realtime",
      "replays",
      "sourcemaps",
      "traces",
    ]);
    expect(Object.isFrozen(app.container)).toBe(true);
    expect(app.container).toBe(app.container);

    await app.close();
  });
});
