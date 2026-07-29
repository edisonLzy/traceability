import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

import {
  createObjectStorage,
  type ObjectStorage,
} from "../infrastructure/object-storage/client.js";

declare module "fastify" {
  interface FastifyInstance {
    objectStorage: ObjectStorage;
  }
}

const registerObjectStorage: FastifyPluginAsync = async (app) => {
  const client = createObjectStorage({
    endpoint: app.config.objectStorageEndpoint,
    region: app.config.objectStorageRegion,
    bucket: app.config.objectStorageBucket,
    accessKey: app.config.objectStorageAccessKey,
    secretKey: app.config.objectStorageSecretKey,
    forcePathStyle: true,
  });
  app.decorate("objectStorage", client);
  app.addHook("onClose", async () => {
    await client.close();
  });
};

export const objectStoragePlugin = fastifyPlugin(registerObjectStorage, {
  name: "object-storage",
  dependencies: ["config"],
});
