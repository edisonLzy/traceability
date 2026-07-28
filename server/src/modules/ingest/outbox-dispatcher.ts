import type { Queue } from "bullmq";
import { and, eq, lte } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { itemQueueJobOptions } from "../../infrastructure/queue/item-queue.js";
import { outbox } from "./schema.js";

export class OutboxDispatcher {
  public constructor(
    private readonly database: Database,
    private readonly queue: Queue,
  ) {}

  async dispatchAvailable(limit = 100): Promise<number> {
    const records = await this.database.db
      .select()
      .from(outbox)
      .where(and(eq(outbox.status, "pending"), lte(outbox.availableAt, new Date())))
      .orderBy(outbox.createdAt)
      .limit(limit);

    let dispatched = 0;
    for (const record of records) {
      try {
        await this.queue.add(record.topic, record.payload, {
          jobId: record.itemId,
          ...itemQueueJobOptions,
        });
        await this.database.db
          .update(outbox)
          .set({ status: "published", publishedAt: new Date() })
          .where(and(eq(outbox.id, record.id), eq(outbox.status, "pending")));
        dispatched += 1;
      } catch {
        const attempts = record.attempts + 1;
        const retryAt = new Date(Date.now() + retryDelayMs(record.attempts));
        await this.database.db
          .update(outbox)
          .set({
            attempts,
            availableAt: retryAt,
            status: attempts >= 5 ? "failed" : "pending",
          })
          .where(eq(outbox.id, record.id));
      }
    }
    return dispatched;
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}
