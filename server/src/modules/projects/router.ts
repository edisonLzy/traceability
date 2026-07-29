import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

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
  list: procedure.query(({ ctx }) => ctx.container.projects.listProjects()),

  get: procedure.input(projectIdInput).query(({ ctx, input }) => {
    return ctx.container.projects.getProject(input);
  }),

  create: procedure.input(CreateProjectInputSchema).mutation(({ ctx, input }) => {
    return ctx.container.projects.createProject(input);
  }),

  update: procedure
    .input(z.object({ projectId: projectIdInput, patch: UpdateProjectInputSchema }))
    .mutation(({ ctx, input }) => {
      return ctx.container.projects.updateProject(input.projectId, input.patch);
    }),

  remove: procedure.input(projectIdInput).mutation(({ ctx, input }) => {
    return ctx.container.projects.deleteProject(input);
  }),

  listKeys: procedure.input(projectIdInput).query(({ ctx, input }) => {
    return ctx.container.projects.listKeys(input);
  }),

  createKey: procedure.input(projectIdInput).mutation(({ ctx, input }) => {
    return ctx.container.projects.createKey(input);
  }),

  revokeKey: procedure
    .input(z.object({ projectId: projectIdInput, keyId: projectIdInput }))
    .mutation(({ ctx, input }) => {
      return ctx.container.projects.revokeKey(input.projectId, input.keyId);
    }),

  getPolicy: procedure.input(projectIdInput).query(({ ctx, input }) => {
    return ctx.container.projects.getPolicy(input);
  }),

  updatePolicy: procedure
    .input(z.object({ projectId: projectIdInput, patch: UpdateProjectPolicyInputSchema }))
    .mutation(({ ctx, input }) => {
      return ctx.container.projects.updatePolicy(input.projectId, input.patch);
    }),
});
