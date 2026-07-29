import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

import { IngestRepository, IngestService } from "../modules/ingest/index.js";
import { IssueRepository, IssueService } from "../modules/issues/index.js";
import { ProcessingRepository, ProcessingService } from "../modules/processing/index.js";
import { ProjectRepository, ProjectService } from "../modules/projects/index.js";
import { SourcemapRepository, SourcemapService } from "../modules/sourcemaps/index.js";

export interface Container {
  projects: ProjectService;
  issues: IssueService;
  ingest: IngestService;
  processing: ProcessingService;
  sourcemaps: SourcemapService;
}

declare module "fastify" {
  interface FastifyInstance {
    container: Container;
  }
}

export const containerPlugin = fastifyPlugin(
  async (app) => {
    const projects = new ProjectService(new ProjectRepository(app.database), app.config);
    const issues = new IssueService(new IssueRepository(app.database));
    const ingest = new IngestService(
      new IngestRepository(app.database),
      projects,
      {
        maxDecompressedBytes: app.config.ingestMaxDecompressedBytes,
        maxItems: app.config.ingestMaxItems,
        maxItemBytes: app.config.ingestMaxItemBytes,
      },
      app.config.redisUrl,
    );
    const processing = new ProcessingService(new ProcessingRepository(app.database));
    const sourcemaps = new SourcemapService(
      new SourcemapRepository(app.database),
      app.objectStorage,
    );
    // NOTE: symbolication runs in the worker, not in the API process — the API
    // container carries `processing` for read APIs only, so we don't need to
    // inject `sourcemaps` into it here.

    app.decorate("container", Object.freeze({ projects, issues, ingest, processing, sourcemaps }));
  },
  {
    name: "container",
    dependencies: ["config", "database", "object-storage"],
  },
);
