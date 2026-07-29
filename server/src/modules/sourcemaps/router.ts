import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

const projectIdInput = z.string().uuid();

export const sourcemapsRouter = t.router({
  listByProject: procedure.input(projectIdInput).query(({ ctx, input }) => {
    return ctx.container.sourcemaps.listByProject(input);
  }),

  remove: procedure
    .input(z.object({ projectId: projectIdInput, artifactId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return ctx.container.sourcemaps.remove(input.projectId, input.artifactId);
    }),
});
