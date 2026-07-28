import type { RuntimeConfig } from "../config/index.js";
import { createDatabase } from "../infrastructure/database/client.js";
import { createItemQueue, createQueueConnection } from "../infrastructure/queue/item-queue.js";
import { OutboxDispatcher } from "../modules/ingest/outbox-dispatcher.js";
import { createShutdown } from "./shutdown.js";

export function createDispatcherRuntime(config: RuntimeConfig) {
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const connection = createQueueConnection(config.redisUrl);
  const queue = createItemQueue(connection);
  const dispatcher = new OutboxDispatcher(database, queue);
  const close = createShutdown([
    () => queue.close(),
    () => connection.quit(),
    () => database.close(),
  ]);

  return { dispatcher, close };
}
