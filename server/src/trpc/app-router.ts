import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { issuesRouter } from "../modules/issues/router.js";
import { operationsRouter } from "../modules/operations/router.js";
import { projectsRouter } from "../modules/projects/router.js";
import { t } from "./trpc.js";

export const appRouter = t.router({
  projects: projectsRouter,
  issues: issuesRouter,
  operations: operationsRouter,
});

export type AppRouter = typeof appRouter;
export type AppRouterInputs = inferRouterInputs<AppRouter>;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
