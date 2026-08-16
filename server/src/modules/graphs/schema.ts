import { randomUUID } from "node:crypto";

import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { projects } from "../projects/schema.js";
import type { GraphEdgeData, GraphNodeData, GraphCommittedEvent, GraphOperation } from "./types.js";

export const graphStatus = pgEnum("graph_status", ["active", "archived"]);
export const graphActorType = pgEnum("graph_actor_type", ["user", "agent", "system"]);
export const graphOutboxStatus = pgEnum("graph_outbox_status", ["pending", "published", "failed"]);

export const graphs = pgTable(
  "graphs",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: graphStatus("status").notNull().default("active"),
    version: integer("version").notNull().default(0),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("graphs_project_status_idx").on(table.projectId, table.status)],
);

export const graphNodes = pgTable(
  "graph_nodes",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    graphId: uuid("graph_id")
      .notNull()
      .references(() => graphs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("ready"),
    positionX: doublePrecision("position_x").notNull().default(0),
    positionY: doublePrecision("position_y").notNull().default(0),
    data: jsonb("data").$type<GraphNodeData>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("graph_nodes_graph_idx").on(table.graphId)],
);

export const graphEdges = pgTable(
  "graph_edges",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    graphId: uuid("graph_id")
      .notNull()
      .references(() => graphs.id, { onDelete: "cascade" }),
    sourceNodeId: uuid("source_node_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "cascade" }),
    targetNodeId: uuid("target_node_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "cascade" }),
    sourceHandle: text("source_handle"),
    targetHandle: text("target_handle"),
    relation: text("relation").notNull(),
    data: jsonb("data").$type<GraphEdgeData>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("graph_edges_graph_idx").on(table.graphId)],
);

export const graphOperations = pgTable(
  "graph_operations",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    operationId: uuid("operation_id").notNull(),
    graphId: uuid("graph_id")
      .notNull()
      .references(() => graphs.id, { onDelete: "cascade" }),
    graphVersion: integer("graph_version").notNull(),
    actorType: graphActorType("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    sessionId: text("session_id"),
    operations: jsonb("operations").$type<GraphOperation[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("graph_operations_graph_operation_unique").on(table.graphId, table.operationId),
    uniqueIndex("graph_operations_graph_version_unique").on(table.graphId, table.graphVersion),
  ],
);

export const graphEventOutbox = pgTable(
  "graph_event_outbox",
  {
    id: uuid("id").primaryKey().$defaultFn(randomUUID),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => graphOperations.id, { onDelete: "cascade" })
      .unique(),
    topic: text("topic").notNull(),
    payload: jsonb("payload").$type<GraphCommittedEvent>().notNull(),
    status: graphOutboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("graph_event_outbox_status_available_idx").on(table.status, table.availableAt)],
);
