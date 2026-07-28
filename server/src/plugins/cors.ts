import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

const registerCors: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    credentials: false,
    origin: app.config.corsOrigins.length > 0 ? app.config.corsOrigins : false,
  });
};

export const corsPlugin = fastifyPlugin(registerCors, {
  name: "cors",
  dependencies: ["config"],
});
