import IORedis from "ioredis";

export function createRedisClient(redisUrl: string): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}
