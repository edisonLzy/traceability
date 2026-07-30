import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  password: vi.fn(),
}));

const inquirer = await import("@inquirer/prompts");

import { NonInteractiveAuthError, ensureConfig, isInteractive } from "./config-interactive.js";

const originalStdinTTY = process.stdin.isTTY;
const originalStderrTTY = process.stderr.isTTY;

afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", { value: originalStdinTTY, configurable: true });
  Object.defineProperty(process.stderr, "isTTY", { value: originalStderrTTY, configurable: true });
});

describe("isInteractive", () => {
  it("returns true when both stdin and stderr are TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(isInteractive()).toBe(true);
  });

  it("returns false when stdin is not a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(isInteractive()).toBe(false);
  });

  it("returns false when stderr is not a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(isInteractive()).toBe(false);
  });
});

describe("NonInteractiveAuthError", () => {
  it("carries a stable code", () => {
    const err = new NonInteractiveAuthError("no tty");
    expect(err.code).toBe("NON_INTERACTIVE_AUTH");
    expect(err.message).toBe("no tty");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("ensureConfig", () => {
  let tmp: string;
  let originalConfigPath: string | undefined;
  let originalServerEnv: string | undefined;
  let originalTokenEnv: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "traceability-cli-cfg-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    originalServerEnv = process.env.TRACEABILITY_SERVER_URL;
    originalTokenEnv = process.env.TRACEABILITY_MANAGEMENT_TOKEN;
    process.env.TRACEABILITY_CONFIG_PATH = join(tmp, "config.json");
    delete process.env.TRACEABILITY_SERVER_URL;
    delete process.env.TRACEABILITY_MANAGEMENT_TOKEN;
    vi.mocked(inquirer.input).mockReset();
    vi.mocked(inquirer.password).mockReset();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
    else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
    if (originalServerEnv === undefined) delete process.env.TRACEABILITY_SERVER_URL;
    else process.env.TRACEABILITY_SERVER_URL = originalServerEnv;
    if (originalTokenEnv === undefined) delete process.env.TRACEABILITY_MANAGEMENT_TOKEN;
    else process.env.TRACEABILITY_MANAGEMENT_TOKEN = originalTokenEnv;
  });

  it("returns stored config without prompting when token is present", async () => {
    writeFileSync(
      process.env.TRACEABILITY_CONFIG_PATH as string,
      JSON.stringify({ server: "https://stored.example", token: "stored-token" }),
    );
    const cfg = await ensureConfig();
    expect(cfg).toEqual({ server: "https://stored.example", token: "stored-token" });
    expect(inquirer.input).not.toHaveBeenCalled();
    expect(inquirer.password).not.toHaveBeenCalled();
  });

  it("falls back to defaults without prompting when non-interactive", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    const cfg = await ensureConfig();
    expect(cfg.server).toBe("http://localhost:3000");
    expect(cfg.token).toBe("traceability-development-token");
    expect(inquirer.input).not.toHaveBeenCalled();
  });

  it("prompts and persists when TTY and no config", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    vi.mocked(inquirer.input).mockResolvedValueOnce("https://prompted.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("prompted-token");
    const cfg = await ensureConfig();
    expect(cfg).toEqual({ server: "https://prompted.example", token: "prompted-token" });
    expect(inquirer.input).toHaveBeenCalledTimes(1);
    expect(inquirer.password).toHaveBeenCalledTimes(1);
    const written = readFileSync(process.env.TRACEABILITY_CONFIG_PATH as string, "utf8");
    expect(JSON.parse(written)).toEqual({
      server: "https://prompted.example",
      token: "prompted-token",
    });
  });

  it("prompts when config exists but token is empty", async () => {
    writeFileSync(
      process.env.TRACEABILITY_CONFIG_PATH as string,
      JSON.stringify({ server: "https://stored.example", token: "" }),
    );
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    vi.mocked(inquirer.input).mockResolvedValueOnce("https://stored.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("new-token");
    const cfg = await ensureConfig();
    expect(cfg.token).toBe("new-token");
    expect(inquirer.input).toHaveBeenCalledTimes(1);
  });
});
