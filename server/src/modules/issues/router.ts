import { z } from "zod";

import { managementProcedure, t } from "../../trpc/trpc.js";

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
  list: managementProcedure.input(ListIssuesInputSchema).query(({ ctx, input }) => {
    return ctx.services.issues.listForProject(input.projectId, {
      cursor: input.cursor,
      limit: input.limit,
    });
  }),

  get: managementProcedure.input(issueIdInput).query(({ ctx, input }) => {
    return ctx.services.issues.getIssue(input);
  }),

  events: managementProcedure.input(ListEventsInputSchema).query(({ ctx, input }) => {
    return ctx.services.issues.listEvents(input.issueId, { limit: input.limit });
  }),

  update: managementProcedure
    .input(z.object({ issueId: issueIdInput, patch: UpdateIssueInputSchema }))
    .mutation(({ ctx, input }) => {
      return ctx.services.issues.updateIssue(input.issueId, input.patch);
    }),
});
