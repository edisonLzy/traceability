import { randomUUID } from "node:crypto";

import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const projectKeyStatus = pgEnum("project_key_status", ["active", "disabled", "revoked"]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    // Sentry SDKs require the DSN path component to be an integer. Keep the
    // UUID as our internal relational key while exposing this stable protocol ID.
    sentryProjectId: serial("sentry_project_id").notNull().unique(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull().default("javascript"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("projects_slug_unique").on(table.slug)],
);

export const projectKeys = pgTable(
  "project_keys",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull().unique(),
    status: projectKeyStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("project_keys_project_public_key_unique").on(table.projectId, table.publicKey),
  ],
);

export const projectPolicies = pgTable("project_policies", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
  rateLimitPerSecond: integer("rate_limit_per_second").notNull().default(100),
  enabledItemTypes: jsonb("enabled_item_types")
    .$type<string[]>()
    .notNull()
    .default(["event", "transaction", "span", "trace_metric"]),
  scrubRules: jsonb("scrub_rules").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});
