import "dotenv/config";
import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./helper/isMainModule.js";
import { registerShutdownSignals } from "./helper/shutdown.js";
import { createDatabase } from "./infrastructure/database/client.js";
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
    await close();
  });

  while (!stopping) {
    const records = await repository.claimPendingOutbox(BATCH_SIZE);

    for (const record of records) {
      try {
        await queue.add(record.topic, record.payload, {
          jobId: record.itemId,
          ...itemQueueJobOptions,
        });
        await repository.markOutboxPublished(record.id, new Date());
      } catch {
        const attempts = record.attempts + 1;
        await repository.markOutboxRetry({
          id: record.id,
          attempts,
          availableAt: new Date(Date.now() + retryDelayMs(record.attempts)),
          failed: attempts >= MAX_ATTEMPTS,
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

if (isMainModule(import.meta.url)) await startDispatcher();
