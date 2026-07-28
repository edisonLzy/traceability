import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../infrastructure/database/client.js";
import type { IngestionRateLimiter } from "../infrastructure/rate-limit/project-rate-limiter.js";
import { configPlugin } from "../plugins/config.js";
import { databasePlugin } from "../plugins/database.js";
import { rateLimiterPlugin } from "../plugins/rate-limiter.js";

const config = {
  databaseUrl: "postgresql://unused",
  databasePoolMax: 1,
  redisUrl: "redis://127.0.0.1:6379",
} as RuntimeConfig;

describe("api infrastructure plugins", () => {
  it("exposes injected resources without taking ownership of them", async () => {
    const database: Database = {
      db: {} as Database["db"],
      ping: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const rateLimiter: IngestionRateLimiter = {
      consume: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
      check: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const app = Fastify();

    await app.register(configPlugin, { config });
    await app.register(databasePlugin, { database });
    await app.register(rateLimiterPlugin, { rateLimiter });
    await app.ready();

    expect(app.config).toBe(config);
    expect(app.database).toBe(database);
    expect(app.rateLimiter).toBe(rateLimiter);

    await app.close();
    expect(database.close).not.toHaveBeenCalled();
    expect(rateLimiter.close).not.toHaveBeenCalled();
  });
});
