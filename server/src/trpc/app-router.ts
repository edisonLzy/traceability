import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { issuesRouter } from "../modules/issues/router.js";
import { processingRouter } from "../modules/processing/index.js";
import { projectsRouter } from "../modules/projects/router.js";
import { sourcemapsRouter } from "../modules/sourcemaps/router.js";
import { t } from "./trpc.js";

export const appRouter = t.router({
  projects: projectsRouter,
  issues: issuesRouter,
  processing: processingRouter,
  sourcemaps: sourcemapsRouter,
});

export type AppRouter = typeof appRouter;
export type AppRouterInputs = inferRouterInputs<AppRouter>;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
