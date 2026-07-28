import "dotenv/config";
import Fastify, { type FastifyInstance } from "fastify";

import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./helper/isMainModule.js";
import type { Database } from "./infrastructure/database/client.js";
import { ingestRouter } from "./modules/ingest/router.js";
import { configPlugin } from "./plugins/config.js";
import { containerPlugin } from "./plugins/container.js";
import { corsPlugin } from "./plugins/cors.js";
import { databasePlugin } from "./plugins/database.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { healthPlugin } from "./plugins/health.js";
import { observabilityPlugin } from "./plugins/observability.js";
import { redisPlugin } from "./plugins/redis.js";
import { trpcPlugin } from "./plugins/trpc.js";

export interface AppDependencies {
  config: ReturnType<typeof loadRuntimeConfig>;
  database?: Database;
}

export async function createApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: deps.config.trustProxy,
    logger: {
      level: deps.config.logLevel,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-sentry-auth",
        "body",
      ],
    },
    requestIdHeader: "x-request-id",
  });

  // Plugins are registered in dependency order:
  //   config → database, redis → container → error-handler, observability, cors, health, trpc
  await app.register(configPlugin, { config: deps.config });
  await app.register(databasePlugin, { database: deps.database });
  await app.register(redisPlugin);
  await app.register(containerPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(observabilityPlugin);
  await app.register(corsPlugin);
  await app.register(healthPlugin);
  await app.register(ingestRouter);
  await app.register(trpcPlugin);

  return app;
}

export async function startApi(): Promise<FastifyInstance> {
  const config = loadRuntimeConfig();
  const app = await createApp({ config });
  await app.listen({ host: config.host, port: config.port });
  return app;
}

if (isMainModule(import.meta.url)) await startApi();
