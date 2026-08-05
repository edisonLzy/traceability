import "dotenv/config";
import { Worker } from "bullmq";

import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./helper/isMainModule.js";
import { registerShutdownSignals } from "./helper/shutdown.js";
import { createDatabase } from "./infrastructure/database/client.js";
import { createLogger } from "./infrastructure/logger.js";
import { createObjectStorage } from "./infrastructure/object-storage/client.js";
import {
  createQueueConnection,
  ITEM_QUEUE_NAME,
  itemQueueJobOptions,
} from "./infrastructure/queue/item-queue.js";
import { MetricsRepository, MetricsService } from "./modules/metrics/index.js";
import { ProcessingRepository, ProcessingService } from "./modules/processing/index.js";
import { createItemProcessors } from "./modules/processing/registry.js";
import { ReplayRepository, ReplayService } from "./modules/replays/index.js";
import { SourcemapRepository, SourcemapService } from "./modules/sourcemaps/index.js";
import { TraceRepository, TraceService } from "./modules/traces/index.js";

interface ItemJob {
  itemId?: string;
}

export async function startWorker(): Promise<void> {
  const config = loadRuntimeConfig();
  const logger = createLogger({ service: "worker", logLevel: config.logLevel });

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
  const traces = new TraceService(new TraceRepository(database));
  const metrics = new MetricsService(new MetricsRepository(database));
  const itemProcessors = createItemProcessors(processing, replays, traces, metrics);

  const worker = new Worker<ItemJob>(
    ITEM_QUEUE_NAME,
    async (job) => {
      logger.debug({ itemId: job.data.itemId, topic: job.name }, "job picked up");
      const processor = itemProcessors[job.name];
      if (!processor) {
        logger.warn({ topic: job.name }, "unsupported worker topic");
        throw new Error(`unsupported worker topic: ${job.name}`);
      }
      const itemId = job.data.itemId;
      if (!itemId) {
        logger.warn({ topic: job.name }, "worker job is missing itemId");
        throw new Error("worker job is missing itemId");
      }
      await processor(itemId);
    },
    { connection, concurrency: 20 },
  );

  worker.on("completed", (job) => {
    logger.info({ itemId: job.data.itemId, topic: job.name }, "item processed");
  });

  worker.on("failed", async (job, error) => {
    if (!job) return;
    const itemId = job.data.itemId;
    if (job.attemptsMade < itemQueueJobOptions.attempts) {
      logger.warn(
        { itemId, topic: job.name, attemptsMade: job.attemptsMade, err: error },
        "job attempt failed; will retry",
      );
      return;
    }
    if (!itemId) return;
    await processing.recordFailure({
      itemId,
      stage: job.name,
      message: error.message,
      attempts: job.attemptsMade,
    });
    logger.error(
      { itemId, stage: job.name, attempts: job.attemptsMade, err: error },
      "item failed permanently; recorded as processing failure",
    );
  });

  worker.on("error", (error) => {
    logger.error({ err: error }, "worker error");
  });

  registerShutdownSignals(async () => {
    logger.info("worker stopping");
    await Promise.allSettled([
      worker.close(),
      connection.quit(),
      objectStorage.close(),
      database.close(),
    ]);
  });

  await new Promise<void>((resolve, reject) => {
    worker.once("ready", () => {
      logger.info("worker ready");
      resolve();
    });
    worker.once("error", reject);
  });
}

if (isMainModule(import.meta.url)) await startWorker();
