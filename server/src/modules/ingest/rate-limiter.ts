import IORedis from "ioredis";

export interface IngestionRateLimiter {
  consume(input: { projectKeyId: string; ip: string; limit: number }): Promise<RateLimitResult>;
  check(): Promise<void>;
  close(): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class NoopIngestionRateLimiter implements IngestionRateLimiter {
  async consume(): Promise<RateLimitResult> {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async check(): Promise<void> {}

  async close(): Promise<void> {}
}

/** Fixed one-second window implemented atomically in Redis. */
export class RedisIngestionRateLimiter implements IngestionRateLimiter {
  private readonly client: IORedis;

  public constructor(redisUrl: string) {
    this.client = new IORedis(redisUrl);
  }

  async consume(input: {
    projectKeyId: string;
    ip: string;
    limit: number;
  }): Promise<RateLimitResult> {
    const windowMs = 1_000;
    const bucket = Math.floor(Date.now() / windowMs);
    const keys = [
      `traceability:rate:project-key:${input.projectKeyId}:${bucket}`,
      `traceability:rate:ip:${input.ip}:${bucket}`,
    ];
    const incrementWindow = async (
      key: string,
      winMs: number,
    ): Promise<{ count: number; ttlMs: number }> => {
      const result = (await this.client.eval(
        `local count = redis.call('INCR', KEYS[1])
         if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return { count, redis.call('PTTL', KEYS[1]) }`,
        1,
        key,
        winMs,
      )) as [number, number];
      return { count: result[0], ttlMs: result[1] };
    };
    const results = await Promise.all(keys.map((key) => incrementWindow(key, windowMs)));
    const retryAfterSeconds = Math.max(...results.map((r) => Math.ceil(r.ttlMs / 1_000)));
    return {
      allowed: results.every((r) => r.count <= input.limit),
      retryAfterSeconds,
    };
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  async check(): Promise<void> {
    const response = await this.client.ping();
    if (response !== "PONG") throw new Error("Redis health check failed");
  }
}
