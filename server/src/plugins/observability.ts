import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

import { createManagementAuth } from "./management-auth.js";

class ServerMetrics {
  public readonly registry = new Registry();
  private readonly requests = new Counter({
    name: "traceability_http_requests_total",
    help: "Completed HTTP requests by route and status.",
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry],
  });
  private readonly duration = new Histogram({
    name: "traceability_http_request_duration_seconds",
    help: "HTTP request duration by route and status.",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  public constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "traceability_process_" });
  }

  observeRequest(input: { method: string; route: string; statusCode: number; durationMs: number }) {
    const labels = {
      method: input.method,
      route: input.route,
      status: String(input.statusCode),
    };
    this.requests.inc(labels);
    this.duration.observe(labels, input.durationMs / 1_000);
  }
}

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
