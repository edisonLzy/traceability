import Fastify from "fastify";
import fastifyPlugin from "fastify-plugin";
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

function makeContext(overrides: Partial<Context["container"]> = {}): RequestContext {
  const projects = {
    listProjects: vi.fn().mockResolvedValue([{ id: "project-1" }]),
    getProject: vi.fn().mockResolvedValue({ id: "project-1" }),
    createProject: vi.fn().mockResolvedValue({ project: { id: "project-1" } }),
    updateProject: vi.fn().mockResolvedValue({ id: "project-1" }),
    listKeys: vi.fn().mockResolvedValue([]),
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

  return {
    config: { jwtSecret, jwtAccessTokenTtlSeconds: 900 } as unknown as RuntimeConfig,
    database: {} as Context["database"],
    container: {
      auth,
      projects: projects as unknown as Context["container"]["projects"],
      issues: issues as unknown as Context["container"]["issues"],
      ingest,
      processing,
      sourcemaps,
      replays,
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

  it("restricts issue updates to the supported status values", async () => {
    const caller = appRouter.createCaller(makeContext());
    const issueId = "00000000-0000-4000-8000-000000000002";

    await expect(caller.issues.update({ issueId, patch: { status: "resolved" } })).resolves.toEqual(
      { id: "issue-1", status: "resolved" },
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
});
