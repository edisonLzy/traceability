import type { RuntimeConfig } from "../config/index.js";
import type { AuthenticatedUser } from "../helper/auth.js";
import type { Database } from "../infrastructure/database/client.js";
import type { Container } from "../plugins/container.js";

export interface Context {
  config: RuntimeConfig;
  database: Database;
  container: Container;
  user?: AuthenticatedUser;
}
