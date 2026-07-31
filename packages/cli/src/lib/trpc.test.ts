import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getConfig } from "./config.js";

const originalStdinTTY = process.stdin.isTTY;
const originalStderrTTY = process.stderr.isTTY;

describe("getTrpcClient authentication", () => {
  let tmp: string;
  let originalFetch: typeof fetch;
  let originalConfigPath: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "traceability-cli-trpc-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    process.env.TRACEABILITY_CONFIG_PATH = join(tmp, "config.json");
    delete process.env.TRACEABILITY_SERVER_URL;
    writeFileSync(
      process.env.TRACEABILITY_CONFIG_PATH,
      JSON.stringify({
        server: "http://mock.example",
        user: { id: "user-1", username: "root", email: "root@example.com" },
        accessToken: "expired-access",
        refreshToken: "refresh-1",
      }),
    );
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(tmp, { recursive: true, force: true });
    if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
    else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
    Object.defineProperty(process.stdin, "isTTY", { value: originalStdinTTY, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", {
      value: originalStderrTTY,
      configurable: true,
    });
  });

  function trpcOkResponse(payload: unknown): Response {
    return new Response(JSON.stringify([{ result: { data: payload } }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  function trpcUnauthorizedResponse(): Response {
    return new Response(
      JSON.stringify([
        {
          error: {
            message: "unauthorized",
            code: -32001,
            data: { code: "UNAUTHORIZED", httpStatus: 401 },
          },
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("rotates both tokens then retries the protected request exactly once", async () => {
    const authorization: string[] = [];
    globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      authorization.push(headers?.authorization ?? "");
      if (authorization.length === 1) return trpcUnauthorizedResponse();
      if (authorization.length === 2) {
        return trpcOkResponse({ accessToken: "rotated-access", refreshToken: "rotated-refresh" });
      }
      return trpcOkResponse([]);
    }) as unknown as typeof fetch;

    const { getTrpcClient } = await import("./trpc.js");
    const client = await getTrpcClient();
    const result = await client.projects.list.query();

    expect(result).toEqual([]);
    expect(authorization).toEqual(["Bearer expired-access", "", "Bearer rotated-access"]);
    expect(getConfig()).toMatchObject({
      accessToken: "rotated-access",
      refreshToken: "rotated-refresh",
      user: { email: "root@example.com" },
    });
  });

  it("clears the stale session and reports AUTH_REQUIRED when refresh fails outside a TTY", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    globalThis.fetch = vi.fn(async () => trpcUnauthorizedResponse()) as unknown as typeof fetch;

    const { getTrpcClient } = await import("./trpc.js");
    const client = await getTrpcClient();
    await expect(client.projects.list.query()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(getConfig()).toEqual({ server: "http://mock.example" });
  });

  it("does not create a protected client when no complete session is configured", async () => {
    writeFileSync(
      process.env.TRACEABILITY_CONFIG_PATH as string,
      JSON.stringify({ server: "http://x" }),
    );

    const { getTrpcClient } = await import("./trpc.js");
    await expect(getTrpcClient()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});
