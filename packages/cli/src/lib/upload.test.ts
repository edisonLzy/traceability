import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getConfig, saveConfig } from "./config.js";
import { uploadSourcemap } from "./upload.js";

describe("uploadSourcemap authentication", () => {
  let directory: string;
  let originalConfigPath: string | undefined;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "traceability-cli-upload-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    process.env.TRACEABILITY_CONFIG_PATH = join(directory, "config.json");
    writeFileSync(join(directory, "app.js.map"), JSON.stringify({ version: 3 }));
    saveConfig({
      server: "http://mock.example",
      user: { id: "user-1", username: "root", email: "root@example.com" },
      accessToken: "expired-access",
      refreshToken: "refresh-1",
    });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
    if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
    else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
  });

  it("refreshes once and retries a source-map upload with the new access token", async () => {
    const authorization: string[] = [];
    globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      authorization.push(headers?.Authorization ?? headers?.authorization ?? "");
      if (authorization.length === 1) return new Response("unauthorized", { status: 401 });
      if (authorization.length === 2) {
        return new Response(
          JSON.stringify([
            { result: { data: { accessToken: "new-access", refreshToken: "new-refresh" } } },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          id: "map-1",
          debugId: "debug-1",
          sizeBytes: 10,
          sha256: "hash",
          reused: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await expect(
      uploadSourcemap({
        filePath: join(directory, "app.js.map"),
        projectSlug: "checkout-web",
        debugId: "debug-1",
      }),
    ).resolves.toMatchObject({ id: "map-1" });

    expect(authorization).toEqual(["Bearer expired-access", "", "Bearer new-access"]);
    expect(getConfig()).toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });
  });
});
