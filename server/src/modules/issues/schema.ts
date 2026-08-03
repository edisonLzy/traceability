import { randomUUID } from "node:crypto";

import {
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

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    groupingVersion: integer("grouping_version").notNull().default(1),
    title: text("title").notNull(),
    type: text("type").notNull().default("error"),
    status: text("status").notNull().default("unresolved"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    eventCount: integer("event_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("issues_project_fingerprint_version_unique").on(
      table.projectId,
      table.fingerprint,
      table.groupingVersion,
    ),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    ingestItemId: uuid("ingest_item_id")
      .notNull()
      .references(() => ingestItems.id, { onDelete: "restrict" })
      .unique(),
    eventId: text("event_id").notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    release: text("release"),
    environment: text("environment"),
    level: text("level"),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    uniqueIndex("events_project_event_id_unique").on(table.projectId, table.eventId),
    index("events_project_trace_id_idx").on(table.projectId, table.traceId),
  ],
);
