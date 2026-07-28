import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../infrastructure/database/client.js";
import type { ApiServices } from "../plugins/services.js";

export type Services = ApiServices;

export interface Context {
  config: RuntimeConfig;
  database: Database;
  services: Services;
}
