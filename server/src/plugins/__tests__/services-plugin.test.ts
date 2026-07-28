import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../../config/index.js";
import type { Database } from "../../infrastructure/database/client.js";
import { configPlugin } from "../config.js";
import { containerPlugin } from "../container.js";
import { databasePlugin } from "../database.js";

describe("application container plugin", () => {
  it("creates one immutable container for the API process", async () => {
    const app = Fastify();
    const config = {
      publicIngestUrl: "http://127.0.0.1:3000",
      ingestMaxDecompressedBytes: 5_242_880,
      ingestMaxItems: 20,
      ingestMaxItemBytes: 1_048_576,
      redisUrl: "redis://127.0.0.1:6379",
    } as RuntimeConfig;
    const database = {
      db: {} as Database["db"],
      ping: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } satisfies Database;

    await app.register(configPlugin, { config });
    await app.register(databasePlugin, { database });
    await app.register(containerPlugin);
    await app.ready();

    expect(Object.keys(app.container).sort()).toEqual([
      "ingest",
      "issues",
      "processing",
      "projects",
    ]);
    expect(Object.isFrozen(app.container)).toBe(true);
    expect(app.container).toBe(app.container);

    await app.close();
  });
});
