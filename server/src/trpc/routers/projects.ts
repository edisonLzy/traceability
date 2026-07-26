import { z } from "zod";

import {
  CreateProjectSchema,
  UpdateProjectPolicySchema,
  UpdateProjectSchema,
} from "../../domains/projects/service.js";
import { managementProcedure, t } from "../trpc.js";

const projectIdInput = z.string().uuid();

export const projectsRouter = t.router({
  list: managementProcedure.query(({ ctx }) => ctx.services.projects.listProjects()),

  get: managementProcedure.input(projectIdInput).query(({ ctx, input }) => {
    return ctx.services.projects.getProject(input);
  }),

  create: managementProcedure.input(CreateProjectSchema).mutation(({ ctx, input }) => {
    return ctx.services.projects.createProject(input);
  }),

  update: managementProcedure
    .input(z.object({ projectId: projectIdInput, patch: UpdateProjectSchema }))
    .mutation(({ ctx, input }) => {
      return ctx.services.projects.updateProject(input.projectId, input.patch);
    }),

  remove: managementProcedure.input(projectIdInput).mutation(({ ctx, input }) => {
    return ctx.services.projects.deleteProject(input);
  }),

  listKeys: managementProcedure.input(projectIdInput).query(({ ctx, input }) => {
    return ctx.services.projects.listKeys(input);
  }),

  createKey: managementProcedure.input(projectIdInput).mutation(({ ctx, input }) => {
    return ctx.services.projects.createKey(input);
  }),

  revokeKey: managementProcedure
    .input(z.object({ projectId: projectIdInput, keyId: projectIdInput }))
    .mutation(({ ctx, input }) => {
      return ctx.services.projects.revokeKey(input.projectId, input.keyId);
    }),

  getPolicy: managementProcedure.input(projectIdInput).query(({ ctx, input }) => {
    return ctx.services.projects.getPolicy(input);
  }),

  updatePolicy: managementProcedure
    .input(z.object({ projectId: projectIdInput, patch: UpdateProjectPolicySchema }))
    .mutation(({ ctx, input }) => {
      return ctx.services.projects.updatePolicy(input.projectId, input.patch);
    }),
});
