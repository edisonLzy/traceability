import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../../config/index.js";
import { createManagementAuth } from "../auth/management-auth.js";
import { ServerMetrics } from "./metrics.js";

export function registerObservability(app: FastifyInstance, config: RuntimeConfig): void {
  const metrics = new ServerMetrics();
  const requestStartedAt = new WeakMap<object, number>();

  app.addHook("onRequest", async (request) => {
    requestStartedAt.set(request, performance.now());
  });
  app.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartedAt.get(request);
    if (startedAt === undefined) return;
    metrics.observeRequest({
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      statusCode: reply.statusCode,
      durationMs: performance.now() - startedAt,
    });
  });

  app.get("/metrics", { preHandler: createManagementAuth(config) }, async (_request, reply) => {
    reply.header("content-type", metrics.registry.contentType);
    return metrics.registry.metrics();
  });
}
