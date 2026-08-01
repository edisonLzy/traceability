import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

const registerSwagger: FastifyPluginAsync = async (app) => {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Traceability Server API",
        description:
          "REST endpoints served by the Traceability server. tRPC procedures live under /api/trpc and are browsable via the tRPC panel at /trpc-panel.",
        version: "1.0.0",
      },
      servers: [{ url: "/" }],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
};

export const swaggerPlugin = fastifyPlugin(registerSwagger, {
  name: "swagger",
});
