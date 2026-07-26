import type { RuntimeConfig } from "../config/index.js";
import type { Database } from "../db/client.js";
import type { IssueService } from "../domains/issues/service.js";
import type { ProjectService } from "../domains/projects/service.js";

export interface Services {
  projects: ProjectService;
  issues: IssueService;
}

export interface Context {
  config: RuntimeConfig;
  database: Database;
  services: Services;
}
