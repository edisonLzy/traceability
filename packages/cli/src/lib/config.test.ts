import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthSession } from "./auth.js";
import {
  DEFAULT_SERVER,
  clearSession,
  configPath,
  getConfig,
  saveConfig,
  saveSession,
  setConfigOverrides,
} from "./config.js";

const session: AuthSession = {
  user: { id: "user-1", username: "root", email: "root@example.com" },
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

describe("CLI configuration", () => {
  let directory: string;
  let originalConfigPath: string | undefined;
  let originalServer: string | undefined;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "traceability-cli-config-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    originalServer = process.env.TRACEABILITY_SERVER_URL;
    process.env.TRACEABILITY_CONFIG_PATH = join(directory, "config.json");
    delete process.env.TRACEABILITY_SERVER_URL;
    setConfigOverrides({});
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
    else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
    if (originalServer === undefined) delete process.env.TRACEABILITY_SERVER_URL;
    else process.env.TRACEABILITY_SERVER_URL = originalServer;
    setConfigOverrides({});
  });

  it("defaults only the server when no config is present", () => {
    expect(getConfig()).toEqual({ server: DEFAULT_SERVER });
  });

  it("prefers a server override over environment and stored configuration", () => {
    saveConfig({ server: "https://stored.example" });
    process.env.TRACEABILITY_SERVER_URL = "https://env.example";
    setConfigOverrides({ server: "https://flag.example" });

    expect(getConfig()).toEqual({ server: "https://flag.example" });
  });

  it("atomically persists a user and complete token pair", () => {
    saveConfig({ server: "https://old.example", ...session });
    saveSession("https://api.example", {
      ...session,
      accessToken: "rotated-access-token",
      refreshToken: "rotated-refresh-token",
    });

    expect(getConfig()).toEqual({
      server: "https://api.example",
      ...session,
      accessToken: "rotated-access-token",
      refreshToken: "rotated-refresh-token",
    });
    expect(JSON.parse(readFileSync(configPath(), "utf8"))).toEqual(getConfig());
    expect(existsSync(`${configPath()}.tmp`)).toBe(false);
  });

  it("clears session data without losing the selected server", () => {
    saveConfig({ server: "https://api.example", ...session });
    clearSession();

    expect(getConfig()).toEqual({ server: "https://api.example" });
  });
});
