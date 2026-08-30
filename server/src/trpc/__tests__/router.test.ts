import Fastify from "fastify";
import fastifyPlugin from "fastify-plugin";
import type IORedis from "ioredis";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../../config/index.js";
import { createAccessToken } from "../../helper/auth.js";
import type { ObjectStorage } from "../../infrastructure/object-storage/client.js";
import { configPlugin } from "../../plugins/config.js";
import { containerPlugin } from "../../plugins/container.js";
import { databasePlugin } from "../../plugins/database.js";
import { trpcPlugin } from "../../plugins/trpc.js";
import { appRouter } from "../app-router.js";
import type { Context } from "../context.js";
import type { RequestContext } from "../trpc.js";

const jwtSecret = "a secure secret that contains at least thirty-two characters";
const createUserToken = () =>
  createAccessToken(
    { id: "00000000-0000-4000-8000-000000000001", username: "root", email: "root@root.com" },
    { jwtSecret, jwtAccessTokenTtlSeconds: 900 },
  );

const stubObjectStorage: ObjectStorage = {
  put: vi.fn(async () => undefined),
  get: vi.fn(async () => Buffer.alloc(0)),
  delete: vi.fn(async () => undefined),
  ping: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
};

const stubObjectStoragePlugin = fastifyPlugin(
  async (app) => {
    app.decorate("objectStorage", stubObjectStorage);
  },
  { name: "object-storage" },
);

const stubRedisPlugin = fastifyPlugin(
  async (app) => {
    app.decorate("redis", { quit: vi.fn(async () => undefined) } as unknown as IORedis);
  },
  { name: "redis" },
);

function makeContext(overrides: Partial<Context["container"]> = {}): RequestContext {
  const projects = {
    listProjects: vi.fn().mockResolvedValue([{ id: "project-1" }]),
    getProject: vi.fn().mockResolvedValue({ id: "project-1" }),
    createProject: vi.fn().mockResolvedValue({ project: { id: "project-1" } }),
    updateProject: vi.fn().mockResolvedValue({ id: "project-1" }),
    listKeys: vi.fn().mockResolvedValue([]),
    listConnections: vi.fn().mockResolvedValue([]),
    createKey: vi.fn().mockResolvedValue({ key: { id: "key-1" } }),
    revokeKey: vi.fn().mockResolvedValue({ id: "key-1" }),
    getPolicy: vi.fn().mockResolvedValue({ projectId: "project-1" }),
    updatePolicy: vi.fn().mockResolvedValue({ projectId: "project-1" }),
  };
  const issues = {
    listForProject: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
    getIssue: vi.fn().mockResolvedValue({ id: "issue-1" }),
    listEvents: vi.fn().mockResolvedValue([]),
    updateIssue: vi.fn().mockResolvedValue({ id: "issue-1", status: "resolved" }),
  };
  const inbox = {
    listForProject: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
    getItem: vi.fn().mockResolvedValue({ id: "inbox-1" }),
    resolve: vi.fn().mockResolvedValue({ item: { id: "inbox-1", state: "done" } }),
    dismiss: vi.fn().mockResolvedValue({ item: { id: "inbox-1", state: "dismissed" } }),
    reopen: vi.fn().mockResolvedValue({ item: { id: "inbox-1", state: "open" } }),
    saveBrief: vi.fn().mockResolvedValue({ id: "inbox-1" }),
  } as unknown as Context["container"]["inbox"];
  const ingest = {} as Context["container"]["ingest"];
  const processing = {
    listFailures: vi.fn().mockResolvedValue([]),
  } as unknown as Context["container"]["processing"];
  const sourcemaps = {
    listByProject: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(null),
  } as unknown as Context["container"]["sourcemaps"];
  const replays = {
    listReplays: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
    getReplay: vi.fn().mockResolvedValue(null),
    getSegment: vi.fn().mockResolvedValue(null),
    deleteReplay: vi.fn().mockResolvedValue(false),
  } as unknown as Context["container"]["replays"];
  const auth = {
    login: vi.fn(),
    refresh: vi.fn(),
  } as unknown as Context["container"]["auth"];
  const metrics = {} as Context["container"]["metrics"];
  const minidumps = {
    listForIssue: vi.fn().mockResolvedValue([]),
    listForEvent: vi.fn().mockResolvedValue([]),
  } as unknown as Context["container"]["minidumps"];
  const traces = {} as Context["container"]["traces"];
  const graphs = {
    listGraphs: vi.fn().mockResolvedValue([]),
    createGraph: vi.fn().mockResolvedValue({
      id: "graph-1",
      projectId: "project-1",
      title: "T",
      status: "active",
      version: 0,
      createdAt: "",
      updatedAt: "",
    }),
    getGraph: vi.fn().mockResolvedValue(null),
    renameGraph: vi.fn().mockResolvedValue({ id: "graph-1" }),
    archiveGraph: vi.fn().mockResolvedValue({ id: "graph-1" }),
    getOperations: vi.fn().mockResolvedValue([]),
    applyOperations: vi.fn().mockResolvedValue({
      graphId: "graph-1",
      version: 1,
      alreadyApplied: false,
      idMappings: {},
      applied: [],
    }),
  } as unknown as Context["container"]["graphs"];
  const realtime = {
    createTicket: vi.fn().mockResolvedValue({ ticket: "ticket", expiresIn: 60 }),
  } as unknown as Context["container"]["realtime"];

  return {
    config: { jwtSecret, jwtAccessTokenTtlSeconds: 900 } as unknown as RuntimeConfig,
    database: {} as Context["database"],
    container: {
      auth,
      projects: projects as unknown as Context["container"]["projects"],
      inbox,
      issues: issues as unknown as Context["container"]["issues"],
      ingest,
      processing,
      sourcemaps,
      replays,
      metrics,
      minidumps,
      traces,
      graphs,
      realtime,
      ...overrides,
    },
    req: {
      headers: {
        authorization: `Bearer ${createUserToken()}`,
      },
    } as RequestContext["req"],
  };
}

function makeDependencies() {
  return {
    config: {
      jwtSecret,
      jwtAccessTokenTtlSeconds: 900,
      redisUrl: "redis://127.0.0.1:6379",
    } as unknown as RuntimeConfig,
    database: {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      },
    } as never,
  };
}

describe("appRouter", () => {
  it("routes project creation through the project service", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.projects.create({ slug: "demo", name: "Demo", platform: "javascript" }),
    ).resolves.toEqual({ project: { id: "project-1" } });
  });

  it("returns DSN connections through the project service", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = "00000000-0000-4000-8000-000000000001";

    await expect(caller.projects.listConnections(projectId)).resolves.toEqual([]);
    const projects = ctx.container.projects as unknown as {
      listConnections: ReturnType<typeof vi.fn>;
    };
    expect(projects.listConnections).toHaveBeenCalledWith(projectId);
  });

  it("passes issue pagination input to the issue service", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);

    await caller.issues.list({
      projectId: "00000000-0000-4000-8000-000000000001",
      limit: 20,
    });

    const issues = ctx.container.issues as unknown as { listForProject: ReturnType<typeof vi.fn> };
    expect(issues.listForProject).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", {
      cursor: undefined,
      limit: 20,
    });
  });

  it("passes Inbox view, search, and pagination input to the Inbox service", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = "00000000-0000-4000-8000-000000000001";

    await caller.inbox.list({ projectId, view: "done", query: "checkout", limit: 20 });

    const inbox = ctx.container.inbox as unknown as {
      listForProject: ReturnType<typeof vi.fn>;
    };
    expect(inbox.listForProject).toHaveBeenCalledWith(projectId, {
      view: "done",
      query: "checkout",
      limit: 20,
    });
  });

  it("routes Inbox actions and Agent brief writes with the authenticated actor", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);
    const inboxItemId = "00000000-0000-4000-8000-000000000002";
    const actorId = "00000000-0000-4000-8000-000000000001";

    await caller.inbox.resolve(inboxItemId);
    await caller.inbox.saveBrief({
      inboxItemId,
      summary: "Summary",
      hypothesis: "Hypothesis",
      nextAction: "Next action",
    });

    const inbox = ctx.container.inbox as unknown as {
      resolve: ReturnType<typeof vi.fn>;
      saveBrief: ReturnType<typeof vi.fn>;
    };
    expect(inbox.resolve).toHaveBeenCalledWith(inboxItemId, actorId);
    expect(inbox.saveBrief).toHaveBeenCalledWith(
      inboxItemId,
      { summary: "Summary", hypothesis: "Hypothesis", nextAction: "Next action" },
      actorId,
    );
  });

  it("lists minidumps associated with an issue", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);
    const issueId = "00000000-0000-4000-8000-000000000001";

    await expect(caller.minidumps.listForIssue(issueId)).resolves.toEqual([]);
    const minidumps = ctx.container.minidumps as unknown as {
      listForIssue: ReturnType<typeof vi.fn>;
    };
    expect(minidumps.listForIssue).toHaveBeenCalledWith(issueId);
  });

  it("restricts issue updates to the supported status values", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);
    const issueId = "00000000-0000-4000-8000-000000000002";

    await expect(caller.issues.update({ issueId, patch: { status: "resolved" } })).resolves.toEqual(
      { id: "issue-1", status: "resolved" },
    );
    const issues = ctx.container.issues as unknown as {
      updateIssue: ReturnType<typeof vi.fn>;
    };
    expect(issues.updateIssue).toHaveBeenCalledWith(
      issueId,
      { status: "resolved" },
      "00000000-0000-4000-8000-000000000001",
    );
    await expect(
      caller.issues.update({ issueId, patch: { status: "fixed" as never } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unauthenticated management calls", async () => {
    const ctx = makeContext();
    ctx.req = { headers: {} } as RequestContext["req"];
    const caller = appRouter.createCaller(ctx);

    await expect(caller.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("enforces management auth through the Fastify HTTP adapter", async () => {
    const app = Fastify();
    const dependencies = makeDependencies();
    await app.register(configPlugin, { config: dependencies.config });
    await app.register(databasePlugin, { database: dependencies.database });
    await app.register(stubObjectStoragePlugin);
    await app.register(stubRedisPlugin);
    await app.register(containerPlugin);
    await app.register(trpcPlugin);

    const unauthorized = await app.inject({
      method: "GET",
      url:
        "/api/trpc/projects.get?input=" +
        encodeURIComponent(JSON.stringify("00000000-0000-4000-8000-000000000001")),
    });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await app.inject({
      method: "GET",
      url:
        "/api/trpc/projects.get?input=" +
        encodeURIComponent(JSON.stringify("00000000-0000-4000-8000-000000000001")),
      headers: {
        authorization: `Bearer ${createUserToken()}`,
      },
    });
    expect(authorized.statusCode).toBe(200);
    await app.close();
  });

  it("routes graphs list through the graphs service", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = "00000000-0000-4000-8000-000000000001";

    await caller.graphs.list({ projectId });

    const graphs = ctx.container.graphs as unknown as { listGraphs: ReturnType<typeof vi.fn> };
    expect(graphs.listGraphs).toHaveBeenCalledWith(projectId);
  });

  it("derives the actor id for graphs mutations from the JWT", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = "00000000-0000-4000-8000-000000000001";

    await caller.graphs.create({ projectId, title: "T" });

    const graphs = ctx.container.graphs as unknown as { createGraph: ReturnType<typeof vi.fn> };
    expect(graphs.createGraph).toHaveBeenCalledWith(
      projectId,
      "T",
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("strips projectId before delegating applyOperations", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = "00000000-0000-4000-8000-000000000001";
    const graphId = "00000000-0000-4000-8000-000000000002";
    const operationId = "00000000-0000-4000-8000-000000000003";
    const operations = [
      {
        op: "createNode" as const,
        id: "q1",
        type: "question" as const,
        position: { x: 0, y: 0 },
        data: { kind: "question" as const, prompt: "why?" },
      },
    ];

    await caller.graphs.applyOperations({
      projectId,
      operationId,
      graphId,
      baseVersion: 0,
      actor: { type: "agent" },
      operations,
    });

    const graphs = ctx.container.graphs as unknown as { applyOperations: ReturnType<typeof vi.fn> };
    expect(graphs.applyOperations).toHaveBeenCalledWith(
      projectId,
      { operationId, graphId, baseVersion: 0, actor: { type: "agent" }, operations },
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("routes realtime ticket creation through the realtime service", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.realtime.createTicket()).resolves.toEqual({
      ticket: "ticket",
      expiresIn: 60,
    });

    const realtime = ctx.container.realtime as unknown as {
      createTicket: ReturnType<typeof vi.fn>;
    };
    expect(realtime.createTicket).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
  });

  it("rejects graphs mutations with an invalid project id", async () => {
    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.graphs.create({ projectId: "not-a-uuid", title: "T" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
