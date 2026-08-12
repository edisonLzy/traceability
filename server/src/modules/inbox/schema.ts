import { randomUUID } from "node:crypto";

import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { issues } from "../issues/schema.js";
import { projects } from "../projects/schema.js";
import type { InboxActivityType, InboxActorType, InboxPriority, InboxState } from "./types.js";

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    state: text("state").$type<InboxState>().notNull().default("open"),
    priority: text("priority").$type<InboxPriority>().notNull().default("p2"),
    triggerReason: text("trigger_reason").notNull(),
    summary: text("summary"),
    hypothesis: text("hypothesis"),
    nextAction: text("next_action"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inbox_items_issue_unique").on(table.issueId),
    index("inbox_items_project_state_activity_idx").on(
      table.projectId,
      table.state,
      table.lastActivityAt,
    ),
  ],
);

export const inboxActivities = pgTable(
  "inbox_activities",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    inboxItemId: uuid("inbox_item_id")
      .notNull()
      .references(() => inboxItems.id, { onDelete: "cascade" }),
    type: text("type").$type<InboxActivityType>().notNull(),
    actorType: text("actor_type").$type<InboxActorType>().notNull(),
    actorId: uuid("actor_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("inbox_activities_item_created_idx").on(table.inboxItemId, table.createdAt)],
);
