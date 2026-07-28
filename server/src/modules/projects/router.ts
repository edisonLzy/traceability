import { z } from "zod";

import { managementProcedure, t } from "../../trpc/trpc.js";

const projectIdInput = z.string().uuid();
const CreateProjectInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  name: z.string().min(1).max(200),
  platform: z.literal("javascript").default("javascript"),
});
const UpdateProjectInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field is required");
const UpdateProjectPolicyInputSchema = z.object({
  allowedOrigins: z.array(z.string().url()).max(100),
  rateLimitPerSecond: z.coerce.number().int().min(1).max(10_000),
  enabledItemTypes: z.array(z.string().min(1).max(64)).max(50),
  scrubRules: z.record(z.string(), z.unknown()).default({}),
});

export const projectsRouter = t.router({
  list: managementProcedure.query(({ ctx }) => ctx.services.projects.listProjects()),

  get: managementProcedure.input(projectIdInput).query(({ ctx, input }) => {
    return ctx.services.projects.getProject(input);
  }),

  create: managementProcedure.input(CreateProjectInputSchema).mutation(({ ctx, input }) => {
    return ctx.services.projects.createProject(input);
  }),

  update: managementProcedure
    .input(z.object({ projectId: projectIdInput, patch: UpdateProjectInputSchema }))
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
    .input(z.object({ projectId: projectIdInput, patch: UpdateProjectPolicyInputSchema }))
    .mutation(({ ctx, input }) => {
      return ctx.services.projects.updatePolicy(input.projectId, input.patch);
    }),
});
