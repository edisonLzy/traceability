import { issuesRouter } from "./routers/issues.js";
import { operationsRouter } from "./routers/operations.js";
import { projectsRouter } from "./routers/projects.js";
import { t } from "./trpc.js";

export const appRouter = t.router({
  projects: projectsRouter,
  issues: issuesRouter,
  operations: operationsRouter,
});

export type AppRouter = typeof appRouter;
