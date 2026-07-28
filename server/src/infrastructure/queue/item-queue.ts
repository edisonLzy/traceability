import { Queue } from "bullmq";
import type IORedis from "ioredis";

import { createRedisClient } from "../redis/client.js";

export const ITEM_QUEUE_NAME = "traceability-items";

export function createQueueConnection(redisUrl: string): IORedis {
  return createRedisClient(redisUrl);
}

export function createItemQueue(connection: IORedis): Queue {
  return new Queue(ITEM_QUEUE_NAME, { connection });
}

export const itemQueueJobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
} as const;
