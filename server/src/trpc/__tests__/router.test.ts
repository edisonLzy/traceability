import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../../config/index.js";
import { configPlugin } from "../../plugins/config.js";
import { databasePlugin } from "../../plugins/database.js";
import { rateLimiterPlugin } from "../../plugins/rate-limiter.js";
import { servicesPlugin } from "../../plugins/services.js";
import { trpcPlugin } from "../../plugins/trpc.js";
import { appRouter } from "../app-router.js";
import type { Context } from "../context.js";
import type { RequestContext } from "../trpc.js";

function makeContext(overrides: Partial<Context["services"]> = {}): RequestContext {
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
  const ingest = {} as Context["services"]["ingest"];
  const processing = {
    listFailures: vi.fn().mockResolvedValue([]),
  } as unknown as Context["services"]["processing"];

  return {
    config: {
      managementAuthToken: "secret",
    } as RuntimeConfig,
    database: {} as Context["database"],
    services: {
      projects: projects as unknown as Context["services"]["projects"],
      issues: issues as unknown as Context["services"]["issues"],
      ingest,
      processing,
      ...overrides,
    },
    req: { headers: { authorization: "Bearer secret" } } as RequestContext["req"],
  };
}

function makeDependencies() {
  return {
    config: { managementAuthToken: "secret" } as RuntimeConfig,
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

    const issues = ctx.services.issues as unknown as { listForProject: ReturnType<typeof vi.fn> };
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
    await app.register(rateLimiterPlugin, {
      rateLimiter: {
        consume: async () => ({ allowed: true, retryAfterSeconds: 0 }),
        check: async () => undefined,
        close: async () => undefined,
      },
    });
    await app.register(servicesPlugin);
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
      headers: { authorization: "Bearer secret" },
    });
    expect(authorized.statusCode).toBe(200);
    await app.close();
  });
});
