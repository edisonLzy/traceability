import "dotenv/config";
import { Worker } from "bullmq";

import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./helper/isMainModule.js";
import { registerShutdownSignals } from "./helper/shutdown.js";
import { createDatabase } from "./infrastructure/database/client.js";
import { createObjectStorage } from "./infrastructure/object-storage/client.js";
import {
  createQueueConnection,
  ITEM_QUEUE_NAME,
  itemQueueJobOptions,
} from "./infrastructure/queue/item-queue.js";
import { ProcessingRepository, ProcessingService } from "./modules/processing/index.js";
import { createItemProcessors } from "./modules/processing/registry.js";
import { ReplayRepository, ReplayService } from "./modules/replays/index.js";
import { SourcemapRepository, SourcemapService } from "./modules/sourcemaps/index.js";

interface ItemJob {
  itemId?: string;
}

export async function startWorker(): Promise<void> {
  const config = loadRuntimeConfig();

  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const objectStorage = createObjectStorage({
    endpoint: config.objectStorageEndpoint,
    region: config.objectStorageRegion,
    bucket: config.objectStorageBucket,
    accessKey: config.objectStorageAccessKey,
    secretKey: config.objectStorageSecretKey,
    forcePathStyle: true,
  });
  const connection = createQueueConnection(config.redisUrl);
  const sourcemaps = new SourcemapService(new SourcemapRepository(database), objectStorage);
  const replays = new ReplayService(new ReplayRepository(database), objectStorage);
  const processing = new ProcessingService(new ProcessingRepository(database), sourcemaps);
  const itemProcessors = createItemProcessors(processing, replays);

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

  const close = registerShutdownSignals(async () => {
    await Promise.allSettled([
      worker.close(),
      connection.quit(),
      objectStorage.close(),
      database.close(),
    ]);
  });

  await new Promise<void>((resolve, reject) => {
    worker.once("ready", () => resolve());
    worker.once("error", reject);
  });
}

if (isMainModule(import.meta.url)) await startWorker();
