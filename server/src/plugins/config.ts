import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

import type { RuntimeConfig } from "../config/index.js";

declare module "fastify" {
  interface FastifyInstance {
    config: RuntimeConfig;
  }
}

export interface ConfigPluginOptions {
  config: RuntimeConfig;
}

const registerConfig: FastifyPluginAsync<ConfigPluginOptions> = async (app, options) => {
  app.decorate("config", options.config);
};

export const configPlugin = fastifyPlugin(registerConfig, {
  name: "config",
});
