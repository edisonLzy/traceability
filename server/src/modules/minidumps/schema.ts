import { randomUUID } from "node:crypto";

import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { ingestItems } from "../ingest/schema.js";
import { projects } from "../projects/schema.js";

export const minidumps = pgTable(
  "minidumps",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ingestItemId: uuid("ingest_item_id")
      .notNull()
      .references(() => ingestItems.id, { onDelete: "restrict" }),
    eventId: text("event_id"),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull().default("application/x-dmp"),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("minidumps_ingest_item_unique").on(table.ingestItemId),
    uniqueIndex("minidumps_storage_key_unique").on(table.storageKey),
    index("minidumps_project_event_idx").on(table.projectId, table.eventId),
  ],
);
