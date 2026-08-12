import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

const inboxItemId = z.string().uuid();
const briefField = z.string().trim().max(20_000).nullable();

export const inboxRouter = t.router({
  list: procedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        view: z.enum(["active", "done"]).default("active"),
        query: z.string().trim().min(1).max(200).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    )
    .query(({ ctx, input }) => {
      const { projectId, ...query } = input;
      return ctx.container.inbox.listForProject(projectId, query);
    }),

  get: procedure.input(inboxItemId).query(({ ctx, input }) => ctx.container.inbox.getItem(input)),

  resolve: procedure
    .input(inboxItemId)
    .mutation(({ ctx, input }) => ctx.container.inbox.resolve(input, ctx.user!.id)),

  dismiss: procedure
    .input(inboxItemId)
    .mutation(({ ctx, input }) => ctx.container.inbox.dismiss(input, ctx.user!.id)),

  reopen: procedure
    .input(inboxItemId)
    .mutation(({ ctx, input }) => ctx.container.inbox.reopen(input, ctx.user!.id)),

  saveBrief: procedure
    .input(
      z.object({
        inboxItemId,
        summary: briefField,
        hypothesis: briefField,
        nextAction: briefField,
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.container.inbox.saveBrief(
        input.inboxItemId,
        {
          summary: input.summary,
          hypothesis: input.hypothesis,
          nextAction: input.nextAction,
        },
        ctx.user!.id,
      );
    }),
});
