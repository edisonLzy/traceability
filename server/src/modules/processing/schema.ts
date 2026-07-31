import { randomUUID } from "node:crypto";

import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { ingestItems } from "../ingest/schema.js";

export const processingFailures = pgTable("processing_failures", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID),
  itemId: uuid("item_id")
    .notNull()
    .references(() => ingestItems.id, { onDelete: "cascade" })
    .unique(),
  stage: text("stage").notNull(),
  errorCode: text("error_code").notNull(),
  message: text("message").notNull(),
  attempts: integer("attempts").notNull(),
  failedAt: timestamp("failed_at", { withTimezone: true }).notNull().defaultNow(),
});
