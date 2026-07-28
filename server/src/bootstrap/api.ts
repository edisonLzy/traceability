import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../infrastructure/database/client.js";
import type { IngestionRateLimiter } from "../infrastructure/rate-limit/project-rate-limiter.js";
import { NoopIngestionRateLimiter } from "../infrastructure/rate-limit/project-rate-limiter.js";
import { ingestRouter } from "../modules/ingest/router.js";
import {
  configPlugin,
  corsPlugin,
  databasePlugin,
  errorHandlerPlugin,
  healthPlugin,
  observabilityPlugin,
  rateLimiterPlugin,
  servicesPlugin,
} from "../plugins/index.js";
import { registerTrpc } from "../trpc/index.js";
import { registerTrpcPanel } from "../trpc/panel.js";

export interface ApiBootstrapOptions {
  config: RuntimeConfig;
  database?: Database;
  rateLimiter?: IngestionRateLimiter;
}

export async function bootstrapApi(
  app: FastifyInstance,
  options: ApiBootstrapOptions,
): Promise<void> {
  await app.register(configPlugin, { config: options.config });
  await app.register(databasePlugin, { database: options.database });
  await app.register(rateLimiterPlugin, {
    rateLimiter:
      options.rateLimiter ?? (options.database ? new NoopIngestionRateLimiter() : undefined),
  });
  await app.register(servicesPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(observabilityPlugin);
  await app.register(corsPlugin);
  await app.register(healthPlugin);
  await app.register(ingestRouter);
  await registerTrpc(app);
  await registerTrpcPanel(app, options.config);
}
