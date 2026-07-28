import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

import { createQueueConnection } from "../infrastructure/queue/item-queue.js";
import {
  RedisIngestionRateLimiter,
  type IngestionRateLimiter,
} from "../infrastructure/rate-limit/project-rate-limiter.js";

export interface RateLimiterPluginOptions {
  rateLimiter?: IngestionRateLimiter;
}

const registerRateLimiter: FastifyPluginAsync<RateLimiterPluginOptions> = async (app, options) => {
  const ownsRateLimiter = options.rateLimiter === undefined;
  const rateLimiter =
    options.rateLimiter ??
    new RedisIngestionRateLimiter(createQueueConnection(app.config.redisUrl));

  app.decorate("rateLimiter", rateLimiter);
  if (ownsRateLimiter) {
    app.addHook("onClose", async () => {
      await rateLimiter.close();
    });
  }
};

export const rateLimiterPlugin = fastifyPlugin(registerRateLimiter, {
  name: "rate-limiter",
  dependencies: ["config"],
});
