import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

import { createDatabase, type Database } from "../infrastructure/database/client.js";

export interface DatabasePluginOptions {
  database?: Database;
}

const registerDatabase: FastifyPluginAsync<DatabasePluginOptions> = async (app, options) => {
  const ownsDatabase = options.database === undefined;
  const database =
    options.database ??
    createDatabase({
      connectionString: app.config.databaseUrl,
      maxConnections: app.config.databasePoolMax,
    });

  app.decorate("database", database);
  if (ownsDatabase) {
    app.addHook("onClose", async () => {
      await database.close();
    });
  }
};

export const databasePlugin = fastifyPlugin(registerDatabase, {
  name: "database",
  dependencies: ["config"],
});
