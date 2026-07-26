import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SERVER, DEFAULT_TOKEN, getConfig, setConfigOverrides } from "./config.js";

const originalServer = process.env.TRACEABILITY_SERVER_URL;
const originalToken = process.env.TRACEABILITY_MANAGEMENT_TOKEN;
const originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
const testConfigPath = `/tmp/traceability-cli-test-${process.pid}.json`;
process.env.TRACEABILITY_CONFIG_PATH = testConfigPath;

beforeEach(() => {
  process.env.TRACEABILITY_CONFIG_PATH = testConfigPath;
});

afterEach(() => {
  setConfigOverrides({});
  if (originalServer === undefined) delete process.env.TRACEABILITY_SERVER_URL;
  else process.env.TRACEABILITY_SERVER_URL = originalServer;
  if (originalToken === undefined) delete process.env.TRACEABILITY_MANAGEMENT_TOKEN;
  else process.env.TRACEABILITY_MANAGEMENT_TOKEN = originalToken;
  if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
  else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
});

describe("CLI config precedence", () => {
  it("uses development defaults when no config is present", () => {
    delete process.env.TRACEABILITY_SERVER_URL;
    delete process.env.TRACEABILITY_MANAGEMENT_TOKEN;
    expect(getConfig({})).toEqual({ server: DEFAULT_SERVER, token: DEFAULT_TOKEN });
  });

  it("prefers explicit overrides over environment variables", () => {
    process.env.TRACEABILITY_SERVER_URL = "https://env.example";
    process.env.TRACEABILITY_MANAGEMENT_TOKEN = "env-token";
    expect(getConfig({ server: "https://flag.example", token: "flag-token" })).toEqual({
      server: "https://flag.example",
      token: "flag-token",
    });
  });
});
