import { issuesRouter } from "../domains/issues/router.js";
import { operationsRouter } from "../domains/operations/router.js";
import { projectsRouter } from "../domains/projects/router.js";
import { t } from "./trpc.js";

export const appRouter = t.router({
  projects: projectsRouter,
  issues: issuesRouter,
  operations: operationsRouter,
});

export type AppRouter = typeof appRouter;
