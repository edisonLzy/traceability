import { and, eq, lte } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { ingestEnvelopes, ingestItems, outbox, outcomes } from "./schema.js";

export interface ProjectContext {
  projectId: string;
  projectKeyId: string;
  allowedOrigins: string[];
  enabledItemTypes: string[];
  rateLimitPerSecond: number;
}

export interface PreparedItem {
  sequence: number;
  type: string;
  header: Record<string, unknown>;
  payload: Buffer | null;
  payloadJson: Record<string, unknown> | null;
  eventId: string | null;
  status: "pending" | "ignored" | "invalid";
  errorCode: string | null;
}

export interface OutboxRecord {
  id: string;
  itemId: string;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export class IngestRepository {
  public constructor(private readonly database: Database) {}

  async persist(input: {
    project: ProjectContext;
    sentAt: Date | null;
    origin?: string;
    userAgent?: string;
    checksum: string;
    sanitizedEnvelope: Buffer;
    items: PreparedItem[];
  }) {
    return this.database.db.transaction(async (transaction) => {
      const [storedEnvelope] = await transaction
        .insert(ingestEnvelopes)
        .values({
          projectId: input.project.projectId,
          projectKeyId: input.project.projectKeyId,
          sentAt: input.sentAt,
          origin: input.origin,
          userAgent: input.userAgent,
          checksum: input.checksum,
          sanitizedEnvelope: input.sanitizedEnvelope,
          itemCount: input.items.length,
        })
        .returning();
      if (!storedEnvelope) throw new Error("ingest envelope insert did not return a row");

      const storedItems = [];
      for (const item of input.items) {
        const [storedItem] = await transaction
          .insert(ingestItems)
          .values({
            envelopeId: storedEnvelope.id,
            sequence: item.sequence,
            type: item.type,
            header: item.header,
            payload: item.payload,
            payloadJson: item.payloadJson,
            eventId: item.eventId,
            status: item.status,
            errorCode: item.errorCode,
          })
          .returning();
        if (!storedItem) throw new Error("ingest item insert did not return a row");
        storedItems.push(storedItem);

        await transaction.insert(outcomes).values({
          envelopeId: storedEnvelope.id,
          itemId: storedItem.id,
          category: item.status === "pending" ? "accepted" : item.status,
          reason: item.errorCode ?? (item.status === "pending" ? "accepted" : "unsupported_item"),
        });

        if (item.status === "pending") {
          await transaction.insert(outbox).values({
            itemId: storedItem.id,
            topic: `ingest.${item.type}`,
            payload: { itemId: storedItem.id },
          });
        }
      }

      return { envelope: storedEnvelope, items: storedItems };
    });
  }

  /**
   * Fetch pending outbox records that are due for dispatch, oldest first.
   */
  async claimPendingOutbox(limit: number, now: Date): Promise<OutboxRecord[]> {
    const rows = await this.database.db
      .select({
        id: outbox.id,
        itemId: outbox.itemId,
        topic: outbox.topic,
        payload: outbox.payload,
        attempts: outbox.attempts,
      })
      .from(outbox)
      .where(and(eq(outbox.status, "pending"), lte(outbox.availableAt, now)))
      .orderBy(outbox.createdAt)
      .limit(limit);
    return rows;
  }

  /** Mark a pending outbox record as successfully published. */
  async markOutboxPublished(id: string, publishedAt: Date): Promise<void> {
    await this.database.db
      .update(outbox)
      .set({ status: "published", publishedAt })
      .where(and(eq(outbox.id, id), eq(outbox.status, "pending")));
  }

  /**
   * Schedule a retry for an outbox record after a failed publish attempt.
   * When `failed` is true the record is moved to the terminal "failed" status.
   */
  async markOutboxRetry(input: {
    id: string;
    attempts: number;
    availableAt: Date;
    failed: boolean;
  }): Promise<void> {
    await this.database.db
      .update(outbox)
      .set({
        attempts: input.attempts,
        availableAt: input.availableAt,
        status: input.failed ? "failed" : "pending",
      })
      .where(eq(outbox.id, input.id));
  }
}
