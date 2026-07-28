import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

import { ServerMetrics } from "../infrastructure/observability/metrics.js";
import { createManagementAuth } from "./management-auth.js";

const registerMetrics: FastifyPluginAsync = async (app) => {
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

  app.get("/metrics", { preHandler: createManagementAuth(app.config) }, async (_request, reply) => {
    reply.header("content-type", metrics.registry.contentType);
    return metrics.registry.metrics();
  });
};

export const observabilityPlugin = fastifyPlugin(registerMetrics, {
  name: "observability",
  dependencies: ["config"],
});
