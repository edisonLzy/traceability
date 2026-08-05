import "dotenv/config";
import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./helper/isMainModule.js";
import { registerShutdownSignals } from "./helper/shutdown.js";
import { createDatabase } from "./infrastructure/database/client.js";
import { createLogger } from "./infrastructure/logger.js";
import {
  createItemQueue,
  createQueueConnection,
  itemQueueJobOptions,
} from "./infrastructure/queue/item-queue.js";
import { IngestRepository } from "./modules/ingest/index.js";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 250;

export async function startDispatcher(): Promise<void> {
  const config = loadRuntimeConfig();
  const logger = createLogger({ service: "dispatcher", logLevel: config.logLevel });

  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const repository = new IngestRepository(database);
  const connection = createQueueConnection(config.redisUrl);
  const queue = createItemQueue(connection);

  const close = async () => {
    await Promise.allSettled([queue.close(), connection.quit(), database.close()]);
  };
  let stopping = false;
  registerShutdownSignals(async () => {
    stopping = true;
    logger.info("dispatcher stopping");
    await close();
  });

  logger.info("dispatcher started");
  while (!stopping) {
    const records = await repository.claimPendingOutbox(BATCH_SIZE, new Date());
    if (records.length > 0) {
      logger.info({ count: records.length }, "claimed outbox records");
    }

    for (const record of records) {
      try {
        await queue.add(record.topic, record.payload, {
          jobId: record.itemId,
          ...itemQueueJobOptions,
        });
        await repository.markOutboxPublished(record.id, new Date());
        logger.debug(
          { itemId: record.itemId, topic: record.topic },
          "outbox record published to queue",
        );
      } catch (error) {
        const attempts = record.attempts + 1;
        await repository.markOutboxRetry({
          id: record.id,
          attempts,
          availableAt: new Date(Date.now() + retryDelayMs(record.attempts)),
          failed: attempts >= MAX_ATTEMPTS,
        });
        logger.warn(
          {
            itemId: record.itemId,
            topic: record.topic,
            attempts,
            failed: attempts >= MAX_ATTEMPTS,
            err: error,
          },
          "failed to publish outbox record; scheduled retry",
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

if (isMainModule(import.meta.url)) await startDispatcher();
