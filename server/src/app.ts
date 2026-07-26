import "dotenv/config";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import type { RuntimeConfig } from "./config/index.js";
import { loadRuntimeConfig } from "./config/index.js";
import { createDatabase, type Database } from "./db/client.js";
import { registerIngestRoutes } from "./domains/ingest/routes.js";
import { registerHealthRoutes } from "./infrastructure/health/index.js";
import { registerErrorHandler } from "./infrastructure/http/index.js";
import { registerObservability } from "./infrastructure/observability/index.js";
import type { IngestionRateLimiter } from "./infrastructure/rate-limit/project-rate-limiter.js";
import { isMainModule } from "./shared/isMainModule.js";
import { registerTrpc } from "./trpc/index.js";
import { registerTrpcPanel } from "./trpc/panel.js";

export interface AppDependencies {
  config: RuntimeConfig;
  database: Database;
  rateLimiter?: IngestionRateLimiter;
}

export async function createApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: dependencies.config.trustProxy,
    logger: {
      level: dependencies.config.logLevel,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-sentry-auth",
        "body",
      ],
    },
    requestIdHeader: "x-request-id",
  });
  registerErrorHandler(app);
  registerObservability(app, dependencies.config);
  registerHealthRoutes(app, dependencies);

  for (const contentType of [
    "application/x-sentry-envelope",
    "application/octet-stream",
    "text/plain",
  ]) {
    app.addContentTypeParser(
      contentType,
      { parseAs: "buffer", bodyLimit: dependencies.config.ingestMaxCompressedBytes },
      (_request, body, done) => done(null, body),
    );
  }

  await app.register(cors, {
    credentials: false,
    origin: dependencies.config.corsOrigins.length > 0 ? dependencies.config.corsOrigins : false,
  });

  await registerIngestRoutes(app, dependencies);
  await registerTrpc(app, dependencies);
  await registerTrpcPanel(app, dependencies.config);

  app.addHook("onClose", async () => {
    await dependencies.rateLimiter?.close();
    await dependencies.database.close();
  });

  return app;
}

export async function startApi(): Promise<FastifyInstance> {
  const config = loadRuntimeConfig();
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const { RedisIngestionRateLimiter } =
    await import("./infrastructure/rate-limit/project-rate-limiter.js");
  const { createQueueConnection } = await import("./infrastructure/queue/item-queue.js");
  const rateLimiter = new RedisIngestionRateLimiter(createQueueConnection(config.redisUrl));
  const app = await createApp({ config, database, rateLimiter });

  await app.listen({ host: config.host, port: config.port });
  return app;
}

if (isMainModule(import.meta.url)) {
  await startApi();
}
