import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

const registerHealth: FastifyPluginAsync = async (app) => {
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await app.database.ping();
      await app.objectStorage.ping();
      await app.redis.ping();
      return { status: "ok" };
    } catch {
      reply.code(503);
      return { status: "unavailable" };
    }
  });
};

export const healthPlugin = fastifyPlugin(registerHealth, {
  name: "health",
  dependencies: ["database", "object-storage", "container"],
});
