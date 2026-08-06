import { z } from "zod";

import { procedure, t } from "../../trpc/trpc.js";

const metricType = z.enum(["counter", "gauge", "distribution"]);
const traceId = z.string().regex(/^[0-9a-f]{32}$/i);
const spanId = z.string().regex(/^[0-9a-f]{16}$/i);
const attributeValue = z.union([z.string(), z.number().finite(), z.boolean()]);
/** 分组聚合时可选排序的聚合列，与 repository 的 groups 查询一致 */
const orderByColumn = z.enum(["count", "sum", "min", "max", "avg", "latest", "p50", "p95", "p99"]);

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
  /** 按属性值分组聚合（如 path/method），返回每组 count/sum/percentile 而非时间桶 */
  groups: procedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(200),
        type: metricType,
        unit: z.string().min(1).max(64).nullable(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        traceId: traceId.optional(),
        spanId: spanId.optional(),
        attributes: z
          .record(z.string().min(1).max(200), attributeValue)
          .refine(
            (value) => Object.keys(value).length <= 10,
            "at most 10 attribute filters are allowed",
          )
          .default({}),
        groupBy: z.string().min(1).max(200),
        orderBy: orderByColumn.optional(),
        orderDesc: z.boolean().default(true),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    )
    .query(({ ctx, input }) => ctx.container.metrics.groups(input)),
});
