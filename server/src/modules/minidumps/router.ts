import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

export const minidumpsRouter = t.router({
  listForIssue: procedure.input(z.string().uuid()).query(({ ctx, input }) => {
    return ctx.container.minidumps.listForIssue(input);
  }),

  listForEvent: procedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        eventId: z.string().min(1).max(64),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.container.minidumps.listForEvent(input.projectId, input.eventId);
    }),
});
