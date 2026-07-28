import { Worker } from "bullmq";

import type { RuntimeConfig } from "../config/index.js";
import { createDatabase } from "../infrastructure/database/client.js";
import {
  createQueueConnection,
  ITEM_QUEUE_NAME,
  itemQueueJobOptions,
} from "../infrastructure/queue/item-queue.js";
import { ProcessingRepository, ProcessingService } from "../modules/processing/index.js";
import { createItemProcessors } from "../modules/processing/registry.js";
import { createShutdown } from "./shutdown.js";

interface ItemJob {
  itemId?: string;
}

export function createWorkerRuntime(config: RuntimeConfig) {
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const connection = createQueueConnection(config.redisUrl);
  const processing = new ProcessingService(new ProcessingRepository(database));
  const itemProcessors = createItemProcessors(processing);
  const worker = new Worker<ItemJob>(
    ITEM_QUEUE_NAME,
    async (job) => {
      const processor = itemProcessors[job.name];
      if (!processor) throw new Error(`unsupported worker topic: ${job.name}`);
      const itemId = job.data.itemId;
      if (!itemId) throw new Error("worker job is missing itemId");
      await processor(itemId);
    },
    { connection, concurrency: 20 },
  );

  worker.on("failed", async (job, error) => {
    if (!job || job.attemptsMade < itemQueueJobOptions.attempts) return;
    const itemId = job.data.itemId;
    if (!itemId) return;
    await processing.recordFailure({
      itemId,
      stage: job.name,
      message: error.message,
      attempts: job.attemptsMade,
    });
  });

  const close = createShutdown([
    () => worker.close(),
    () => connection.quit(),
    () => database.close(),
  ]);
  const ready = () =>
    new Promise<void>((resolve, reject) => {
      worker.once("ready", () => resolve());
      worker.once("error", reject);
    });

  return { worker, ready, close };
}
