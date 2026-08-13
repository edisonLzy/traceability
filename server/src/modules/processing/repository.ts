import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { inboxActivities, inboxItems } from "../inbox/schema.js";
import { ingestEnvelopes, ingestItems } from "../ingest/schema.js";
import { events, issues } from "../issues/schema.js";
import { processingFailures } from "./schema.js";
import type { EventFields } from "./types.js";

export class ProcessingRepository {
  public constructor(private readonly database: Database) {}

  listFailures(limit = 100) {
    return this.database.db
      .select()
      .from(processingFailures)
      .orderBy(desc(processingFailures.failedAt))
      .limit(limit);
  }

  async processEventItem(
    itemId: string,
    deriveFields: (payload: Record<string, unknown>, receivedAt: Date) => EventFields,
    symbolicate?: (payload: Record<string, unknown>, projectId: string) => Promise<void>,
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
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

      // Symbolicate BEFORE deriving fields so the fingerprint keys on the
      // resolved filenames/functions rather than the minified bundle. The
      // callback mutates the payload object in place; failures inside are
      // swallowed by the symbolicator and marked on `payload.symbolicated`.
      if (symbolicate) {
        try {
          await symbolicate(item.payload, item.projectId);
        } catch {
          item.payload.symbolicated = "unavailable";
        }
      }

      const fields = deriveFields(item.payload, item.receivedAt);
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
          traceId: fields.traceId,
          spanId: fields.spanId,
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

      const now = new Date();
      const nextIssueStatus = issue.status === "ignored" ? "ignored" : "unresolved";
      await transaction
        .update(issues)
        .set({
          eventCount: sql`${issues.eventCount} + 1`,
          lastSeen: fields.timestamp,
          status: nextIssueStatus,
          updatedAt: now,
        })
        .where(eq(issues.id, issue.id));

      const [currentInboxItem] = await transaction
        .select()
        .from(inboxItems)
        .where(eq(inboxItems.issueId, issue.id))
        .limit(1);
      const targetInboxState = issue.status === "ignored" ? "dismissed" : "open";
      const priority = fields.level === "fatal" ? "p1" : "p2";

      if (!currentInboxItem) {
        const [createdInboxItem] = await transaction
          .insert(inboxItems)
          .values({
            projectId: issue.projectId,
            issueId: issue.id,
            state: targetInboxState,
            priority,
            triggerReason:
              issue.status === "ignored"
                ? "Ignored issue received an event"
                : "New unresolved issue",
            completedAt: targetInboxState === "open" ? null : now,
            lastActivityAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!createdInboxItem) throw new Error("inbox item insert did not return a row");
        await transaction.insert(inboxActivities).values({
          inboxItemId: createdInboxItem.id,
          type: "created",
          actorType: "system",
          payload: { state: targetInboxState, reason: "issue_created" },
          createdAt: now,
        });
      } else {
        const regressed = issue.status === "resolved";
        const nextPriority = currentInboxItem.priority === "p1" ? "p1" : priority;
        await transaction
          .update(inboxItems)
          .set({
            state: targetInboxState,
            priority: nextPriority,
            triggerReason: regressed
              ? "Issue recurred after being resolved"
              : currentInboxItem.triggerReason,
            completedAt: targetInboxState === "open" ? null : currentInboxItem.completedAt,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(inboxItems.id, currentInboxItem.id));

        if (currentInboxItem.state !== targetInboxState) {
          await transaction.insert(inboxActivities).values({
            inboxItemId: currentInboxItem.id,
            type: "state_changed",
            actorType: "system",
            payload: {
              fromState: currentInboxItem.state,
              toState: targetInboxState,
              reason: regressed ? "issue_regressed" : "issue_status_synchronized",
            },
            createdAt: now,
          });
        }
      }

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

  async recordFailure(input: {
    itemId: string;
    stage: string;
    message: string;
    attempts: number;
  }): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(ingestItems)
        .set({
          status: "failed",
          errorCode: "worker_retry_exhausted",
          attempts: input.attempts,
          processedAt: new Date(),
        })
        .where(eq(ingestItems.id, input.itemId));
      await transaction
        .insert(processingFailures)
        .values({
          itemId: input.itemId,
          stage: input.stage,
          errorCode: "worker_retry_exhausted",
          message: input.message.slice(0, 4_000),
          attempts: input.attempts,
        })
        .onConflictDoUpdate({
          target: processingFailures.itemId,
          set: {
            message: input.message.slice(0, 4_000),
            attempts: input.attempts,
            failedAt: new Date(),
          },
        });
    });
  }
}
