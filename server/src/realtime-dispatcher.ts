import "dotenv/config";
import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./helper/isMainModule.js";
import { registerShutdownSignals } from "./helper/shutdown.js";
import { createDatabase } from "./infrastructure/database/client.js";
import { createLogger } from "./infrastructure/logger.js";
import { createRedisClient } from "./infrastructure/redis/client.js";
import { GraphRepository } from "./modules/graphs/index.js";
import { publishEvent } from "./modules/realtime/event-bus.js";
import { REALTIME_CHANNEL } from "./modules/realtime/types.js";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 250;

/**
 * Drains `graph_event_outbox` and publishes each committed graph event to
 * Redis Pub/Sub, which the WebSocket gateway(s) subscribe to. A separate
 * process keeps the durable outbox (written in the mutation transaction) from
 * depending on the API process staying alive after commit.
 */
export async function startRealtimeDispatcher(): Promise<void> {
  const config = loadRuntimeConfig();
  const logger = createLogger({ service: "realtime-dispatcher", logLevel: config.logLevel });

  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const repository = new GraphRepository(database);
  const redis = createRedisClient(config.redisUrl);

  const close = async () => {
    await Promise.allSettled([redis.quit(), database.close()]);
  };
  let stopping = false;
  registerShutdownSignals(async () => {
    stopping = true;
    logger.info("realtime-dispatcher stopping");
    await close();
  });

  logger.info("realtime-dispatcher started");
  while (!stopping) {
    const records = await repository.claimPendingEvents(BATCH_SIZE);

    for (const record of records) {
      try {
        await publishEvent(redis, REALTIME_CHANNEL, record.payload);
        await repository.markEventPublished(record.id, new Date());
        logger.debug({ topic: record.topic }, "graph event published");
      } catch (error) {
        const attempts = record.attempts + 1;
        await repository.markEventRetry({
          id: record.id,
          attempts,
          availableAt: new Date(Date.now() + retryDelayMs(record.attempts)),
          failed: attempts >= MAX_ATTEMPTS,
        });
        logger.warn(
          { topic: record.topic, attempts, failed: attempts >= MAX_ATTEMPTS, err: error },
          "failed to publish graph event; scheduled retry",
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

if (isMainModule(import.meta.url)) await startRealtimeDispatcher();
