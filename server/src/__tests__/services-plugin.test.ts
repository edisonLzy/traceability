import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../infrastructure/database/client.js";
import type { IngestionRateLimiter } from "../infrastructure/rate-limit/project-rate-limiter.js";
import { configPlugin } from "../plugins/config.js";
import { databasePlugin } from "../plugins/database.js";
import { rateLimiterPlugin } from "../plugins/rate-limiter.js";
import { servicesPlugin } from "../plugins/services.js";

describe("application services plugin", () => {
  it("creates one immutable service registry for the API process", async () => {
    const app = Fastify();
    const config = {
      publicIngestUrl: "http://127.0.0.1:3000",
      ingestMaxDecompressedBytes: 5_242_880,
      ingestMaxItems: 20,
      ingestMaxItemBytes: 1_048_576,
    } as RuntimeConfig;
    const database = {
      db: {} as Database["db"],
      ping: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } satisfies Database;
    const rateLimiter = {
      consume: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
      check: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    } satisfies IngestionRateLimiter;

    await app.register(configPlugin, { config });
    await app.register(databasePlugin, { database });
    await app.register(rateLimiterPlugin, { rateLimiter });
    await app.register(servicesPlugin);
    await app.ready();

    expect(Object.keys(app.services).sort()).toEqual([
      "ingest",
      "issues",
      "operations",
      "projects",
    ]);
    expect(Object.isFrozen(app.services)).toBe(true);
    expect(app.services).toBe(app.services);

    await app.close();
  });
});
