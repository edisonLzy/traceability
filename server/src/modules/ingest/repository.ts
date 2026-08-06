import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { ingestEnvelopes, ingestItems, outbox, outcomes } from "./schema.js";

/**
 * How long a claimed outbox record may be held before another dispatcher can
 * re-claim it. Claimed records are normally marked published or retried within
 * milliseconds, so this is a safety margin for a dispatcher that crashed
 * mid-batch, not a processing throttle.
 */
const CLAIM_LEASE_SECONDS = 60;

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
   * Atomically claim up to `limit` due outbox records, oldest first.
   *
   * The claim is a single CTE UPDATE: the inner SELECT locks the next `limit`
   * eligible rows with `FOR UPDATE SKIP LOCKED`, and the UPDATE stamps
   * `claimed_at` on them. Multiple dispatcher instances race safely — each
   * takes exactly the rows no other instance has locked, so no record is ever
   * claimed twice — and because the claim is a row-state transition that the
   * WHERE clause respects, the lock never has to span the Redis enqueue.
   * Records left claimed by a crashed dispatcher become re-claimable once the
   * lease expires.
   */
  async claimPendingOutbox(limit: number): Promise<OutboxRecord[]> {
    const result = await this.database.db.execute(sql`
      WITH claimed AS (
        SELECT id
        FROM outbox
        WHERE status = 'pending'
          AND available_at <= now()
          AND (claimed_at IS NULL
               OR claimed_at < now() - make_interval(secs => ${CLAIM_LEASE_SECONDS}))
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox
      SET claimed_at = now()
      WHERE id IN (SELECT id FROM claimed)
      RETURNING id, item_id, topic, payload, attempts
    `);
    return result.rows.map((row) => ({
      id: row.id as string,
      itemId: row.item_id as string,
      topic: row.topic as string,
      payload: row.payload as Record<string, unknown>,
      attempts: row.attempts as number,
    }));
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
        claimedAt: null,
        status: input.failed ? "failed" : "pending",
      })
      .where(eq(outbox.id, input.id));
  }
}
