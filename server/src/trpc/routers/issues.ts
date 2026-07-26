import { z } from "zod";

import { UpdateIssueSchema } from "../../domains/issues/service.js";
import { managementProcedure, t } from "../trpc.js";

const issueIdInput = z.string().uuid();
const listInput = z.object({
  projectId: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const issuesRouter = t.router({
  list: managementProcedure.input(listInput).query(({ ctx, input }) => {
    return ctx.services.issues.listForProject(input.projectId, {
      cursor: input.cursor,
      limit: input.limit,
    });
  }),

  get: managementProcedure.input(issueIdInput).query(({ ctx, input }) => {
    return ctx.services.issues.getIssue(input);
  }),

  events: managementProcedure
    .input(
      z.object({
        issueId: issueIdInput,
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.services.issues.listEvents(input.issueId, { limit: input.limit });
    }),

  update: managementProcedure
    .input(z.object({ issueId: issueIdInput, patch: UpdateIssueSchema }))
    .mutation(({ ctx, input }) => {
      return ctx.services.issues.updateIssue(input.issueId, input.patch);
    }),
});
