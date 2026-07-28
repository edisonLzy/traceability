import { fastifyTRPCPlugin, type CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import type { FastifyInstance } from "fastify";

import { appRouter } from "./app-router.js";

export async function registerTrpc(app: FastifyInstance): Promise<void> {
  await app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }: CreateFastifyContextOptions) => ({
        config: app.config,
        database: app.database,
        services: app.services,
        req,
      }),
    },
  });
}
