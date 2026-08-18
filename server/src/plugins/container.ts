import fastifyPlugin from "fastify-plugin";

import { AuthService, AuthRepository } from "../modules/auth/index.js";
import { GraphRepository, GraphService } from "../modules/graphs/index.js";
import { InboxRepository, InboxService } from "../modules/inbox/index.js";
import { IngestRepository, IngestService } from "../modules/ingest/index.js";
import { IssueRepository, IssueService } from "../modules/issues/index.js";
import { MetricsRepository, MetricsService } from "../modules/metrics/index.js";
import { MinidumpRepository, MinidumpService } from "../modules/minidumps/index.js";
import { ProcessingRepository, ProcessingService } from "../modules/processing/index.js";
import { ProjectRepository, ProjectService } from "../modules/projects/index.js";
import { RealtimeTicketService } from "../modules/realtime/index.js";
import { ReplayRepository, ReplayService } from "../modules/replays/index.js";
import { SourcemapRepository, SourcemapService } from "../modules/sourcemaps/index.js";
import { TraceRepository, TraceService } from "../modules/traces/index.js";

export interface Container {
  auth: AuthService;
  projects: ProjectService;
  inbox: InboxService;
  issues: IssueService;
  ingest: IngestService;
  processing: ProcessingService;
  sourcemaps: SourcemapService;
  replays: ReplayService;
  metrics: MetricsService;
  minidumps: MinidumpService;
  traces: TraceService;
  graphs: GraphService;
  realtime: RealtimeTicketService;
}

declare module "fastify" {
  interface FastifyInstance {
    container: Container;
  }
}

export const containerPlugin = fastifyPlugin(
  async (app) => {
    const auth = new AuthService(new AuthRepository(app.database), app.config, 7 * 24 * 60 * 60);
    const projects = new ProjectService(new ProjectRepository(app.database), app.config);
    const inboxRepository = new InboxRepository(app.database);
    const inbox = new InboxService(inboxRepository);
    const issues = new IssueService(new IssueRepository(app.database), inbox);
    const ingest = new IngestService(
      new IngestRepository(app.database),
      projects,
      {
        maxCompressedBytes: app.config.ingestMaxCompressedBytes,
        maxDecompressedBytes: app.config.ingestMaxDecompressedBytes,
        maxItems: app.config.ingestMaxItems,
        maxItemBytes: app.config.ingestMaxItemBytes,
        replayMaxRecordingBytes: app.config.replayMaxRecordingBytes,
        minidumpMaxBytes: app.config.minidumpMaxBytes,
      },
      app.config.redisUrl,
    );
    const processing = new ProcessingService(new ProcessingRepository(app.database));
    const replays = new ReplayService(new ReplayRepository(app.database), app.objectStorage);
    const metrics = new MetricsService(new MetricsRepository(app.database));
    const minidumps = new MinidumpService(new MinidumpRepository(app.database), app.objectStorage);
    const traces = new TraceService(new TraceRepository(app.database));
    const sourcemaps = new SourcemapService(
      new SourcemapRepository(app.database),
      app.objectStorage,
    );
    const graphs = new GraphService(new GraphRepository(app.database));
    const realtime = new RealtimeTicketService(app.config, app.redis);
    // NOTE: symbolication runs in the worker, not in the API process — the API
    // container carries `processing` for read APIs only, so we don't need to
    // inject `sourcemaps` into it here.

    app.decorate(
      "container",
      Object.freeze({
        auth,
        projects,
        inbox,
        issues,
        ingest,
        processing,
        sourcemaps,
        replays,
        metrics,
        minidumps,
        traces,
        graphs,
        realtime,
      }),
    );
  },
  {
    name: "container",
    dependencies: ["config", "database", "object-storage", "redis"],
  },
);
