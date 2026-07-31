import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../infrastructure/database/client.js";
import { configPlugin } from "../config.js";
import { databasePlugin } from "../database.js";

const config = {
  databaseUrl: "postgresql://unused",
  databasePoolMax: 1,
  redisUrl: "redis://127.0.0.1:6379",
} as never;

describe("api infrastructure plugins", () => {
  it("config exposes the injected RuntimeConfig", async () => {
    const app = Fastify();
    await app.register(configPlugin, { config });
    await app.ready();
    expect(app.config).toBe(config);
    await app.close();
  });

  it("database plugin does not take ownership of the connection", async () => {
    const database: Database = {
      db: {} as Database["db"],
      ping: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const app = Fastify();

    await app.register(configPlugin, { config });
    await app.register(databasePlugin, { database });
    await app.ready();

    expect(app.database).toBe(database);

    await app.close();
    expect(database.close).not.toHaveBeenCalled();
  });
});
