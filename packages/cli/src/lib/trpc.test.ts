import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  password: vi.fn(),
}));

const inquirer = await import("@inquirer/prompts");

const originalStdinTTY = process.stdin.isTTY;
const originalStderrTTY = process.stderr.isTTY;

describe("getTrpcClient reauth", () => {
  let tmp: string;
  let originalFetch: typeof fetch;
  let originalConfigPath: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "traceability-cli-trpc-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    process.env.TRACEABILITY_CONFIG_PATH = join(tmp, "config.json");
    delete process.env.TRACEABILITY_MANAGEMENT_TOKEN;
    delete process.env.TRACEABILITY_SERVER_URL;
    writeFileSync(
      process.env.TRACEABILITY_CONFIG_PATH,
      JSON.stringify({ server: "http://mock.example", token: "old-token" }),
    );
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    originalFetch = globalThis.fetch;
    vi.mocked(inquirer.input).mockReset();
    vi.mocked(inquirer.password).mockReset();
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
    // tRPC v11 non-batch httpBatchLink response is a JSON array of { result: { data } }
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
      {
        // HTTP status 200 keeps httpBatchLink's per-item parsing consistent
        // across environments; the { error: { data.code: UNAUTHORIZED } }
        // payload is what triggers the client-side classification.
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  it("retries once after UNAUTHORIZED and returns success", async () => {
    const authHeaders: string[] = [];
    globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      authHeaders.push(headers?.authorization ?? "");
      if (authHeaders.length === 1) return trpcUnauthorizedResponse();
      return trpcOkResponse([]);
    }) as unknown as typeof fetch;

    vi.mocked(inquirer.input).mockResolvedValueOnce("http://mock.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("new-token");

    const { getTrpcClient } = await import("./trpc.js");
    const client = await getTrpcClient();
    const result = await client.projects.list.query();

    expect(result).toEqual([]);
    expect(authHeaders).toEqual(["Bearer old-token", "Bearer new-token"]);
    expect(inquirer.password).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry also fails and throws UNAUTHORIZED", async () => {
    globalThis.fetch = vi.fn(async () => trpcUnauthorizedResponse()) as unknown as typeof fetch;

    vi.mocked(inquirer.input).mockResolvedValueOnce("http://mock.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("still-bad");

    const { getTrpcClient } = await import("./trpc.js");
    const client = await getTrpcClient();
    await expect(client.projects.list.query()).rejects.toMatchObject({
      data: { code: "UNAUTHORIZED" },
    });
    expect(inquirer.password).toHaveBeenCalledTimes(1);
  });

  it("propagates UNAUTHORIZED unchanged in non-TTY", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    globalThis.fetch = vi.fn(async () => trpcUnauthorizedResponse()) as unknown as typeof fetch;

    const { getTrpcClient } = await import("./trpc.js");
    const client = await getTrpcClient();
    await expect(client.projects.list.query()).rejects.toMatchObject({
      data: { code: "UNAUTHORIZED" },
    });
    expect(inquirer.password).not.toHaveBeenCalled();
  });
});
