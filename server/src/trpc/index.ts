import { fastifyTRPCPlugin, type CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../db/client.js";
import { IssueService } from "../domains/issues/service.js";
import { ProjectService } from "../domains/projects/service.js";
import { appRouter } from "./app-router.js";

export interface TrpcDependencies {
  config: RuntimeConfig;
  database: Database;
}

export async function registerTrpc(
  app: FastifyInstance,
  dependencies: TrpcDependencies,
): Promise<void> {
  const services = {
    projects: new ProjectService(dependencies.database, dependencies.config),
    issues: new IssueService(dependencies.database),
  };

  await app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }: CreateFastifyContextOptions) => ({
        config: dependencies.config,
        database: dependencies.database,
        services,
        req,
      }),
    },
  });
}
