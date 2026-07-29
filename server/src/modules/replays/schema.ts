import { randomUUID } from "node:crypto";

import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { projects } from "../projects/schema.js";

export const replaySessions = pgTable(
  "replay_sessions",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    replayId: text("replay_id").notNull(),
    platform: text("platform"),
    release: text("release"),
    environment: text("environment"),
    replayType: text("replay_type").notNull().default("session"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    urlList: jsonb("url_list").$type<string[]>().default([]),
    errorIds: jsonb("error_ids").$type<string[]>().default([]),
    traceIds: jsonb("trace_ids").$type<string[]>().default([]),
    segmentCount: integer("segment_count").notNull().default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("replay_sessions_project_replay_id_unique").on(table.projectId, table.replayId),
  ],
);

export const replaySegments = pgTable(
  "replay_segments",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    replayId: uuid("replay_id")
      .notNull()
      .references(() => replaySessions.id, { onDelete: "cascade" }),
    segmentId: integer("segment_id").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("replay_segments_replay_segment_unique").on(table.replayId, table.segmentId)],
);
