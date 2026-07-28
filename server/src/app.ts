import "dotenv/config";
import Fastify, { type FastifyInstance } from "fastify";

import { bootstrapApi, type ApiBootstrapOptions } from "./bootstrap/api.js";
import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./shared/isMainModule.js";

export type AppDependencies = ApiBootstrapOptions;

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

  await bootstrapApi(app, dependencies);
  return app;
}

export async function startApi(): Promise<FastifyInstance> {
  const config = loadRuntimeConfig();
  const app = await createApp({ config });
  await app.listen({ host: config.host, port: config.port });
  return app;
}

if (isMainModule(import.meta.url)) await startApi();
