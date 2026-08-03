import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { authRouter } from "../modules/auth/router.js";
import { issuesRouter } from "../modules/issues/router.js";
import { metricsRouter } from "../modules/metrics/router.js";
import { processingRouter } from "../modules/processing/index.js";
import { projectsRouter } from "../modules/projects/router.js";
import { replaysRouter } from "../modules/replays/router.js";
import { sourcemapsRouter } from "../modules/sourcemaps/router.js";
import { tracesRouter } from "../modules/traces/router.js";
import { t } from "./trpc.js";

export const appRouter = t.router({
  auth: authRouter,
  projects: projectsRouter,
  issues: issuesRouter,
  processing: processingRouter,
  sourcemaps: sourcemapsRouter,
  replays: replaysRouter,
  metrics: metricsRouter,
  traces: tracesRouter,
});

export type AppRouter = typeof appRouter;
export type AppRouterInputs = inferRouterInputs<AppRouter>;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
