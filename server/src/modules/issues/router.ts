import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

const issueIdInput = z.string().uuid();
const ListIssuesInputSchema = z.object({
  projectId: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const ListEventsInputSchema = z.object({
  issueId: issueIdInput,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const UpdateIssueInputSchema = z.object({
  status: z.enum(["unresolved", "resolved", "ignored"]),
});

export const issuesRouter = t.router({
  list: procedure.input(ListIssuesInputSchema).query(({ ctx, input }) => {
    return ctx.container.issues.listForProject(input.projectId, {
      cursor: input.cursor,
      limit: input.limit,
    });
  }),

  get: procedure.input(issueIdInput).query(({ ctx, input }) => {
    return ctx.container.issues.getIssue(input);
  }),

  events: procedure.input(ListEventsInputSchema).query(({ ctx, input }) => {
    return ctx.container.issues.listEvents(input.issueId, { limit: input.limit });
  }),

  update: procedure
    .input(z.object({ issueId: issueIdInput, patch: UpdateIssueInputSchema }))
    .mutation(({ ctx, input }) => {
      return ctx.container.issues.updateIssue(input.issueId, input.patch);
    }),
});
