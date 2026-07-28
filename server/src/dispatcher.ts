import "dotenv/config";
import { and, eq, lte } from "drizzle-orm";

import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./helper/isMainModule.js";
import { registerShutdownSignals } from "./helper/shutdown.js";
import { createDatabase } from "./infrastructure/database/client.js";
import {
  createItemQueue,
  createQueueConnection,
  itemQueueJobOptions,
} from "./infrastructure/queue/item-queue.js";
import { outbox } from "./modules/ingest/schema.js";

export async function startDispatcher(): Promise<void> {
  const config = loadRuntimeConfig();

  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const connection = createQueueConnection(config.redisUrl);
  const queue = createItemQueue(connection);

  const close = async () => {
    await Promise.allSettled([queue.close(), connection.quit(), database.close()]);
  };
  let stopping = false;
  registerShutdownSignals(async () => {
    stopping = true;
    await close();
  });

  while (!stopping) {
    const records = await database.db
      .select()
      .from(outbox)
      .where(and(eq(outbox.status, "pending"), lte(outbox.availableAt, new Date())))
      .orderBy(outbox.createdAt)
      .limit(100);

    for (const record of records) {
      try {
        await queue.add(record.topic, record.payload, {
          jobId: record.itemId,
          ...itemQueueJobOptions,
        });
        await database.db
          .update(outbox)
          .set({ status: "published", publishedAt: new Date() })
          .where(and(eq(outbox.id, record.id), eq(outbox.status, "pending")));
      } catch {
        const attempts = record.attempts + 1;
        const retryAt = new Date(Date.now() + retryDelayMs(record.attempts));
        await database.db
          .update(outbox)
          .set({
            attempts,
            availableAt: retryAt,
            status: attempts >= 5 ? "failed" : "pending",
          })
          .where(eq(outbox.id, record.id));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

if (isMainModule(import.meta.url)) await startDispatcher();
