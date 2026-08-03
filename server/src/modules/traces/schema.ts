import { randomUUID } from "node:crypto";

import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ingestItems } from "../ingest/schema.js";
import { projects } from "../projects/schema.js";

export const traceSpans = pgTable(
  "trace_spans",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ingestItemId: uuid("ingest_item_id")
      .notNull()
      .references(() => ingestItems.id, { onDelete: "restrict" }),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    parentSpanId: text("parent_span_id"),
    name: text("name").notNull(),
    op: text("op"),
    status: text("status"),
    isSegment: boolean("is_segment").notNull().default(false),
    startTimestamp: timestamp("start_timestamp", { withTimezone: true }).notNull(),
    endTimestamp: timestamp("end_timestamp", { withTimezone: true }).notNull(),
    durationMs: doublePrecision("duration_ms").notNull(),
    release: text("release"),
    environment: text("environment"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    measurements: jsonb("measurements").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("trace_spans_project_trace_span_unique").on(
      table.projectId,
      table.traceId,
      table.spanId,
    ),
    index("trace_spans_project_start_idx").on(table.projectId, table.startTimestamp),
    index("trace_spans_project_trace_idx").on(table.projectId, table.traceId),
    index("trace_spans_project_segment_start_idx").on(
      table.projectId,
      table.isSegment,
      table.startTimestamp,
    ),
  ],
);
