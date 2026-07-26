import type { RuntimeConfig } from "../config/index.js";
import type { PostgresDatabase } from "../db/postgres.js";
import type { IssueService } from "../domains/issues/service.js";
import type { ProjectService } from "../domains/projects/service.js";

export interface Services {
  projects: ProjectService;
  issues: IssueService;
}

export interface Context {
  config: RuntimeConfig;
  database: PostgresDatabase;
  services: Services;
}
