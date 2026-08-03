import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

const metricType = z.enum(["counter", "gauge", "distribution"]);
const traceId = z.string().regex(/^[0-9a-f]{32}$/i);
const spanId = z.string().regex(/^[0-9a-f]{16}$/i);
const attributeValue = z.union([z.string(), z.number().finite(), z.boolean()]);

export const metricsRouter = t.router({
  catalog: procedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        prefix: z.string().min(1).max(200).optional(),
        type: metricType.optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    )
    .query(({ ctx, input }) => ctx.container.metrics.catalog(input)),
  series: procedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(200),
        type: metricType,
        unit: z.string().min(1).max(64).nullable(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        resolution: z.enum(["1m", "5m", "1h", "1d"]),
        traceId: traceId.optional(),
        spanId: spanId.optional(),
        attributes: z
          .record(z.string().min(1).max(200), attributeValue)
          .refine(
            (value) => Object.keys(value).length <= 10,
            "at most 10 attribute filters are allowed",
          )
          .default({}),
      }),
    )
    .query(({ ctx, input }) => ctx.container.metrics.series(input)),
});
