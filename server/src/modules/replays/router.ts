import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

const projectIdInput = z.string().uuid();

const ListReplaysInputSchema = z.object({
  projectId: projectIdInput,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  errorId: z.string().optional(),
});

export const replaysRouter = t.router({
  list: procedure.input(ListReplaysInputSchema).query(({ ctx, input }) => {
    return ctx.container.replays.listReplays(input.projectId, {
      cursor: input.cursor,
      limit: input.limit,
      errorId: input.errorId,
    });
  }),

  get: procedure
    .input(z.object({ projectId: projectIdInput, replayId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      return ctx.container.replays.getReplay(input.projectId, input.replayId);
    }),

  getSegment: procedure
    .input(
      z.object({
        projectId: projectIdInput,
        replayId: z.string().min(1),
        segmentId: z.coerce.number().int().min(0),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.container.replays.getSegment(input.projectId, input.replayId, input.segmentId);
    }),

  delete: procedure
    .input(z.object({ projectId: projectIdInput, replayId: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.container.replays.deleteReplay(input.projectId, input.replayId);
    }),
});
