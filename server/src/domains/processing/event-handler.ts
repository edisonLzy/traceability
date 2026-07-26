import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { ingestEnvelopes, ingestItems } from "../ingest/db.js";
import { events, issues } from "../issues/db.js";

export async function processEventItem(database: Database, itemId: string): Promise<void> {
  await database.db.transaction(async (transaction) => {
    const [item] = await transaction
      .select({
        id: ingestItems.id,
        status: ingestItems.status,
        eventId: ingestItems.eventId,
        payload: ingestItems.payloadJson,
        projectId: ingestEnvelopes.projectId,
        receivedAt: ingestEnvelopes.receivedAt,
      })
      .from(ingestItems)
      .innerJoin(ingestEnvelopes, eq(ingestEnvelopes.id, ingestItems.envelopeId))
      .where(eq(ingestItems.id, itemId))
      .limit(1);

    if (!item || item.status !== "pending") return;
    if (!item.payload || !item.eventId) {
      await transaction
        .update(ingestItems)
        .set({ status: "failed", errorCode: "event_payload_missing", processedAt: new Date() })
        .where(eq(ingestItems.id, itemId));
      return;
    }

    // Event IDs are supplied by the SDK. A retry can produce a second ingest
    // item for the same event, so detect that before creating or updating an
    // issue. This keeps both issue counters and grouping idempotent.
    const [existingEvent] = await transaction
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.projectId, item.projectId), eq(events.eventId, item.eventId)))
      .limit(1);
    if (existingEvent) {
      await transaction
        .update(ingestItems)
        .set({
          status: "processed_duplicate",
          processedAt: new Date(),
          attempts: sql`${ingestItems.attempts} + 1`,
        })
        .where(eq(ingestItems.id, item.id));
      return;
    }

    const fields = deriveEventFields(item.payload, item.receivedAt);
    const [issue] = await transaction
      .insert(issues)
      .values({
        projectId: item.projectId,
        fingerprint: fields.fingerprint,
        groupingVersion: 1,
        title: fields.title,
        type: fields.type,
        firstSeen: fields.timestamp,
        lastSeen: fields.timestamp,
      })
      .onConflictDoUpdate({
        target: [issues.projectId, issues.fingerprint, issues.groupingVersion],
        set: { lastSeen: fields.timestamp, updatedAt: new Date() },
      })
      .returning();
    if (!issue) throw new Error("issue upsert did not return a row");

    const [event] = await transaction
      .insert(events)
      .values({
        projectId: item.projectId,
        issueId: issue.id,
        ingestItemId: item.id,
        eventId: item.eventId,
        eventTimestamp: fields.timestamp,
        release: fields.release,
        environment: fields.environment,
        level: fields.level,
        payload: item.payload,
      })
      .onConflictDoNothing()
      .returning();

    if (!event) {
      await transaction
        .update(ingestItems)
        .set({ status: "processed_duplicate", processedAt: new Date() })
        .where(eq(ingestItems.id, item.id));
      return;
    }

    await transaction
      .update(issues)
      .set({
        eventCount: sql`${issues.eventCount} + 1`,
        lastSeen: fields.timestamp,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issue.id));
    await transaction
      .update(ingestItems)
      .set({
        status: "processed",
        processedAt: new Date(),
        attempts: sql`${ingestItems.attempts} + 1`,
      })
      .where(eq(ingestItems.id, item.id));
  });
}

function deriveEventFields(payload: Record<string, unknown>, receivedAt: Date) {
  const exception = firstException(payload);
  const type = exception?.type ?? "Error";
  const message = exception?.value ?? stringValue(payload.message) ?? "Unhandled event";
  const candidateFrames = exception?.stacktrace?.frames;
  const frames = Array.isArray(candidateFrames) ? candidateFrames : [];
  const inAppFrames = frames
    .filter((frame) => frame.in_app !== false)
    .slice(-5)
    .map((frame) => `${frame.filename ?? ""}:${frame.function ?? ""}`)
    .join("|");
  const fingerprint = createHash("sha256")
    .update(`${type}\n${normalizeMessage(message)}\n${inAppFrames}`)
    .digest("hex");

  return {
    fingerprint,
    title: `${type}: ${message}`.slice(0, 500),
    type: "error",
    timestamp: eventTimestamp(payload.timestamp, receivedAt),
    release: stringValue(payload.release),
    environment: stringValue(payload.environment),
    level: stringValue(payload.level),
  };
}

interface StackFrame {
  filename?: string;
  function?: string;
  in_app?: boolean;
}

interface ExceptionValue {
  type?: string;
  value?: string;
  stacktrace?: { frames?: StackFrame[] };
}

function firstException(payload: Record<string, unknown>): ExceptionValue | undefined {
  const exception = payload.exception;
  if (!exception || typeof exception !== "object" || Array.isArray(exception)) return undefined;
  const values = (exception as { values?: unknown }).values;
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const value = values[0];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ExceptionValue)
    : undefined;
}

function eventTimestamp(value: unknown, fallback: Date): Date {
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value === "string") {
    const timestamp = new Date(value);
    if (!Number.isNaN(timestamp.valueOf())) return timestamp;
  }
  return fallback;
}

function normalizeMessage(message: string): string {
  return message
    .replace(/\b\d+\b/g, "#")
    .replace(/\b[0-9a-f]{8,}\b/gi, "#")
    .slice(0, 500);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
