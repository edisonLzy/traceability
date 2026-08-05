import { randomUUID } from "node:crypto";

import {
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { projectKeys, projects } from "../projects/schema.js";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const ingestItemStatus = pgEnum("ingest_item_status", [
  "pending",
  "ignored",
  "invalid",
  "processing",
  "processed",
  "processed_duplicate",
  "failed",
]);

export const outboxStatus = pgEnum("outbox_status", ["pending", "published", "failed"]);

export const ingestEnvelopes = pgTable("ingest_envelopes", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  projectKeyId: uuid("project_key_id")
    .notNull()
    .references(() => projectKeys.id, { onDelete: "restrict" }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  origin: text("origin"),
  userAgent: text("user_agent"),
  checksum: text("checksum").notNull(),
  sanitizedEnvelope: bytea("sanitized_envelope").notNull(),
  itemCount: integer("item_count").notNull(),
});

export const ingestItems = pgTable("ingest_items", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID),
  envelopeId: uuid("envelope_id")
    .notNull()
    .references(() => ingestEnvelopes.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  header: jsonb("header").$type<Record<string, unknown>>().notNull(),
  payload: bytea("payload"),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
  eventId: text("event_id"),
  status: ingestItemStatus("status").notNull(),
  handlerVersion: integer("handler_version").notNull().default(1),
  attempts: integer("attempts").notNull().default(0),
  errorCode: text("error_code"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outbox = pgTable("outbox", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID),
  itemId: uuid("item_id")
    .notNull()
    .references(() => ingestItems.id, { onDelete: "cascade" })
    .unique(),
  topic: text("topic").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outcomes = pgTable("outcomes", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID),
  envelopeId: uuid("envelope_id")
    .notNull()
    .references(() => ingestEnvelopes.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => ingestItems.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
