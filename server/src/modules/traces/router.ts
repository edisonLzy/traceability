import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

const traceId = z.string().regex(/^[0-9a-f]{32}$/i);

export const tracesRouter = t.router({
  list: procedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        name: z.string().min(1).max(200).optional(),
        op: z.string().min(1).max(100).optional(),
        status: z.string().min(1).max(100).optional(),
        environment: z.string().min(1).max(200).optional(),
        release: z.string().min(1).max(200).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    )
    .query(({ ctx, input }) => ctx.container.traces.list(input)),
  get: procedure
    .input(z.object({ projectId: z.string().uuid(), traceId }))
    .query(({ ctx, input }) => ctx.container.traces.get(input.projectId, input.traceId)),
});
