import type IORedis from "ioredis";

/**
 * Redis Pub/Sub helpers. The publisher and subscriber must be separate ioredis
 * connections: once a connection enters subscriber mode it cannot publish.
 */
export function publishEvent(redis: IORedis, channel: string, payload: unknown): Promise<number> {
  return redis.publish(channel, JSON.stringify(payload));
}

export function subscribeEvents(
  redis: IORedis,
  channel: string,
  onMessage: (message: string) => void,
): void {
  redis.on("message", (receivedChannel, message) => {
    if (receivedChannel === channel) onMessage(message);
  });
  // Fire-and-forget: ioredis queues the SUBSCRIBE and (re)connects in the
  // background, so an unavailable Redis at startup does not block the API or
  // crash it — the caller attaches an "error" listener to swallow reconnect
  // failures.
  void redis.subscribe(channel).catch(() => undefined);
}
