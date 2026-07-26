import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../config/index.js";
import { appRouter } from "./app-router.js";

const panelPath = "/trpc-panel";

/**
 * Register the interactive tRPC UI only outside production. The panel shell
 * is intentionally public in development so it can be opened directly; the
 * procedures it invokes still enforce the existing management Bearer token.
 */
export async function registerTrpcPanel(
  app: FastifyInstance,
  config: RuntimeConfig,
): Promise<void> {
  if (config.environment === "production") return;

  app.get(panelPath, async (_request, reply) => {
    const { renderTrpcPanel } = await import("@ajayche/trpc-panel");
    const html = renderTrpcPanel(appRouter, {
      url: "/api/trpc",
      meta: {
        title: "Traceability tRPC",
        description: "Development-only UI for browsing and invoking management procedures.",
      },
    });

    return reply.type("text/html; charset=utf-8").send(html);
  });
}
