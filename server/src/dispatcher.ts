import "dotenv/config";
import { loadRuntimeConfig } from "./config/index.js";
import { createDatabase } from "./db/client.js";
import { createItemQueue, createQueueConnection } from "./infrastructure/queue/item-queue.js";
import { OutboxDispatcher } from "./infrastructure/queue/outbox-dispatcher.js";
import { isMainModule } from "./shared/isMainModule.js";

export async function startDispatcher(): Promise<void> {
  const config = loadRuntimeConfig();
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const connection = createQueueConnection(config.redisUrl);
  const queue = createItemQueue(connection);
  const dispatcher = new OutboxDispatcher(database, queue);
  let stopping = false;

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await Promise.allSettled([queue.close(), connection.quit(), database.close()]);
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());

  while (!stopping) {
    await dispatcher.dispatchAvailable();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

if (isMainModule(import.meta.url)) await startDispatcher();
