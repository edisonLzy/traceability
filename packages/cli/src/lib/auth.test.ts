import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthRequiredError, getSession, login, refreshOrLogin } from "./auth.js";
import { saveConfig } from "./config.js";

const originalFetch = globalThis.fetch;

describe("auth session", () => {
  let directory: string;
  let originalConfigPath: string | undefined;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "traceability-cli-auth-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    process.env.TRACEABILITY_CONFIG_PATH = join(directory, "config.json");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
    if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
    else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
  });

  it("reports a stable error when no complete session is configured", () => {
    expect(() => getSession({ server: "http://localhost:3000" })).toThrow(AuthRequiredError);
    expect(() => getSession({ server: "http://localhost:3000" })).toThrow(
      "Run: traceability auth login",
    );
  });

  it("uses a public client for login and returns the user session", async () => {
    let authorization = "unexpected";
    globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      authorization = headers?.authorization ?? "";
      return new Response(
        JSON.stringify([
          {
            result: {
              data: {
                user: { id: "user-1", username: "root", email: "root@example.com" },
                accessToken: "access",
                refreshToken: "refresh",
              },
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await expect(
      login("http://mock.example", { email: "root@example.com", password: "secret" }),
    ).resolves.toEqual({
      user: { id: "user-1", username: "root", email: "root@example.com" },
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(authorization).toBe("");
  });

  it("shares concurrent token refreshes so a rotated refresh token is used once", async () => {
    const session = {
      user: { id: "user-1", username: "root", email: "root@example.com" },
      accessToken: "access-1",
      refreshToken: "refresh-1",
    };
    saveConfig({ server: "http://mock.example", ...session });
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { result: { data: { accessToken: "access-2", refreshToken: "refresh-2" } } },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;

    await expect(Promise.all([refreshOrLogin(session), refreshOrLogin(session)])).resolves.toEqual([
      { ...session, accessToken: "access-2", refreshToken: "refresh-2" },
      { ...session, accessToken: "access-2", refreshToken: "refresh-2" },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
