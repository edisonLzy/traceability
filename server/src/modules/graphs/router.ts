import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";
import { applyOperationsInputSchema } from "./types.js";

const projectIdInput = z.string().uuid();
const graphIdInput = z.string().uuid();
const titleInput = z.string().min(1).max(200);

export const graphsRouter = t.router({
  list: procedure.input(z.object({ projectId: projectIdInput })).query(({ ctx, input }) => {
    return ctx.container.graphs.listGraphs(input.projectId);
  }),

  create: procedure
    .input(z.object({ projectId: projectIdInput, title: titleInput }))
    .mutation(({ ctx, input }) => {
      return ctx.container.graphs.createGraph(input.projectId, input.title, ctx.user!.id);
    }),

  get: procedure
    .input(z.object({ projectId: projectIdInput, graphId: graphIdInput }))
    .query(({ ctx, input }) => {
      return ctx.container.graphs.getGraph(input.projectId, input.graphId);
    }),

  rename: procedure
    .input(z.object({ projectId: projectIdInput, graphId: graphIdInput, title: titleInput }))
    .mutation(({ ctx, input }) => {
      return ctx.container.graphs.renameGraph(input.projectId, input.graphId, input.title);
    }),

  archive: procedure
    .input(z.object({ projectId: projectIdInput, graphId: graphIdInput }))
    .mutation(({ ctx, input }) => {
      return ctx.container.graphs.archiveGraph(input.projectId, input.graphId);
    }),

  getOperations: procedure
    .input(
      z.object({
        projectId: projectIdInput,
        graphId: graphIdInput,
        afterVersion: z.coerce.number().int().min(0).default(0),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.container.graphs.getOperations(input.projectId, input.graphId, input.afterVersion);
    }),

  applyOperations: procedure
    .input(applyOperationsInputSchema.extend({ projectId: projectIdInput }))
    .mutation(({ ctx, input }) => {
      const { projectId, ...operationInput } = input;
      return ctx.container.graphs.applyOperations(projectId, operationInput, ctx.user!.id);
    }),
});
