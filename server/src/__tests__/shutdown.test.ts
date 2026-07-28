import { describe, expect, it, vi } from "vitest";

import { createShutdown } from "../bootstrap/shutdown.js";

describe("runtime shutdown", () => {
  it("closes owned resources once when called repeatedly", async () => {
    const closeWorker = vi.fn(async () => undefined);
    const closeRedis = vi.fn(async () => undefined);
    const shutdown = createShutdown([closeWorker, closeRedis]);

    await Promise.all([shutdown(), shutdown(), shutdown()]);

    expect(closeWorker).toHaveBeenCalledOnce();
    expect(closeRedis).toHaveBeenCalledOnce();
  });
});
