import { fastifyTRPCPlugin, type CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import fastifyPlugin from "fastify-plugin";

import { appRouter } from "../trpc/app-router.js";

export const trpcPlugin = fastifyPlugin(
  async (app) => {
    await app.register(fastifyTRPCPlugin, {
      prefix: "/api/trpc",
      trpcOptions: {
        router: appRouter,
        createContext: ({ req }: CreateFastifyContextOptions) => ({
          config: app.config,
          database: app.database,
          container: app.container,
          req,
        }),
      },
    });

    // tRPC panel — development only; the panel shell is intentionally public
    // so it can be opened directly, but the procedures it invokes still enforce
    // the management Bearer token.
    if (app.config.environment !== "production") {
      const { renderTrpcPanel } = await import("@ajayche/trpc-panel");
      app.get("/trpc-panel", async (_request, reply) => {
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
  },
  {
    name: "trpc",
    dependencies: ["config", "database", "container"],
  },
);
