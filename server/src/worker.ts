import "dotenv/config";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";

import { loadRuntimeConfig } from "./config/index.js";
import { createDatabase } from "./db/client.js";
import { ingestItems, processingFailures } from "./domains/ingest/db.js";
import { itemProcessors } from "./domains/processing/registry.js";
import {
  createQueueConnection,
  ITEM_QUEUE_NAME,
  itemQueueJobOptions,
} from "./infrastructure/queue/item-queue.js";
import { isMainModule } from "./shared/isMainModule.js";

interface ItemJob {
  itemId?: string;
}

export async function startWorker(): Promise<void> {
  const config = loadRuntimeConfig();
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const connection = createQueueConnection(config.redisUrl);
  const worker = new Worker<ItemJob>(
    ITEM_QUEUE_NAME,
    async (job) => {
      const processor = itemProcessors[job.name];
      if (!processor) throw new Error(`unsupported worker topic: ${job.name}`);
      const itemId = job.data.itemId;
      if (!itemId) throw new Error("worker job is missing itemId");
      await processor(database, itemId);
    },
    {
      connection,
      concurrency: 20,
    },
  );
  worker.on("failed", async (job, error) => {
    if (!job || job.attemptsMade < itemQueueJobOptions.attempts) return;
    const itemId = job.data.itemId;
    if (!itemId) return;
    await database.db.transaction(async (transaction) => {
      await transaction
        .update(ingestItems)
        .set({
          status: "failed",
          errorCode: "worker_retry_exhausted",
          attempts: job.attemptsMade,
          processedAt: new Date(),
        })
        .where(eq(ingestItems.id, itemId));
      await transaction
        .insert(processingFailures)
        .values({
          itemId,
          stage: job.name,
          errorCode: "worker_retry_exhausted",
          message: error.message.slice(0, 4_000),
          attempts: job.attemptsMade,
        })
        .onConflictDoUpdate({
          target: processingFailures.itemId,
          set: {
            message: error.message.slice(0, 4_000),
            attempts: job.attemptsMade,
            failedAt: new Date(),
          },
        });
    });
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await Promise.allSettled([worker.close(), connection.quit(), database.close()]);
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());

  await new Promise<void>((resolve, reject) => {
    worker.once("ready", () => resolve());
    worker.once("error", reject);
  });
}

if (isMainModule(import.meta.url)) await startWorker();
