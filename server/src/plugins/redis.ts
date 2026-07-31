import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";
import type IORedis from "ioredis";

import { createRedisClient } from "../infrastructure/redis/client.js";

declare module "fastify" {
  interface FastifyInstance {
    redis: IORedis;
  }
}

const registerRedis: FastifyPluginAsync = async (app) => {
  const client = createRedisClient(app.config.redisUrl);
  app.decorate("redis", client);
  app.addHook("onClose", async () => {
    await client.quit();
  });
};

export const redisPlugin = fastifyPlugin(registerRedis, {
  name: "redis",
  dependencies: ["config"],
});
