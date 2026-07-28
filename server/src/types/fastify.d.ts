import "fastify";
import type IORedis from "ioredis";

import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../infrastructure/database/client.js";
import type { Container } from "../plugins/container.js";

declare module "fastify" {
  interface FastifyInstance {
    config: RuntimeConfig;
    database: Database;
    redis: IORedis;
    container: Container;
  }
}
