import pino from "pino";

import type { RuntimeConfig } from "../config/index.js";

/**
 * Create a standalone pino logger for background processes (dispatcher,
 * worker) that do not run inside Fastify. `service` tags each line so
 * logs from different processes can be separated; level follows the
 * shared `LOG_LEVEL` config used by the API.
 */
export function createLogger(options: {
  service: string;
  logLevel: RuntimeConfig["logLevel"];
}): pino.Logger {
  return pino({
    name: `traceability-${options.service}`,
    level: options.logLevel,
    base: { service: options.service },
  });
}
