import "fastify";
import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../infrastructure/database/client.js";
import type { IngestionRateLimiter } from "../infrastructure/rate-limit/project-rate-limiter.js";
import type { ApiServices } from "../plugins/services.js";

declare module "fastify" {
  interface FastifyInstance {
    config: RuntimeConfig;
    database: Database;
    rateLimiter: IngestionRateLimiter;
    services: ApiServices;
  }
}
