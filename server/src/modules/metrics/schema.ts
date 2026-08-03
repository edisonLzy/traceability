import { randomUUID } from "node:crypto";

import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ingestItems } from "../ingest/schema.js";
import { projects } from "../projects/schema.js";

export const metricSamples = pgTable(
  "metric_samples",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ingestItemId: uuid("ingest_item_id")
      .notNull()
      .references(() => ingestItems.id, { onDelete: "restrict" }),
    sampleIndex: integer("sample_index").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    name: text("name").notNull(),
    type: text("type").notNull(),
    unit: text("unit"),
    value: doublePrecision("value").notNull(),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_samples_item_index_unique").on(table.ingestItemId, table.sampleIndex),
    index("metric_samples_project_timestamp_idx").on(table.projectId, table.timestamp),
    index("metric_samples_project_name_type_timestamp_idx").on(
      table.projectId,
      table.name,
      table.type,
      table.timestamp,
    ),
    index("metric_samples_project_trace_idx").on(table.projectId, table.traceId),
    index("metric_samples_project_span_idx").on(table.projectId, table.spanId),
  ],
);
