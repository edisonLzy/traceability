import type { FastifyInstance } from "fastify";

import type { Database } from "../../db/client.js";
import type { IngestionRateLimiter } from "../rate-limit/project-rate-limiter.js";

export interface HealthDependencies {
  database: Database;
  rateLimiter?: IngestionRateLimiter;
}

export function registerHealthRoutes(app: FastifyInstance, dependencies: HealthDependencies): void {
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await dependencies.database.ping();
      await dependencies.rateLimiter?.check();
      return { status: "ok" };
    } catch {
      reply.code(503);
      return { status: "unavailable" };
    }
  });
}
