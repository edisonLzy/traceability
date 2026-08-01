import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveConfig } from "../lib/config.js";
import { authCommand } from "./auth.js";

describe("auth commands", () => {
  let directory: string;
  let originalConfigPath: string | undefined;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "traceability-cli-auth-command-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    process.env.TRACEABILITY_CONFIG_PATH = join(directory, "config.json");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
    else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
    vi.restoreAllMocks();
  });

  async function run(args: string[]): Promise<void> {
    const program = new Command().exitOverride();
    authCommand(program);
    await program.parseAsync(["node", "traceability", "auth", ...args]);
  }

  it("reports local session identity as JSON without secrets", async () => {
    saveConfig({
      server: "https://api.example",
      user: { id: "user-1", username: "root", email: "root@example.com" },
      accessToken: "do-not-print-access",
      refreshToken: "do-not-print-refresh",
    });
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["status", "--json"]);

    const value = JSON.stringify(output.mock.calls[0]?.[0]);
    expect(value).toContain("root@example.com");
    expect(value).not.toContain("do-not-print-access");
    expect(value).not.toContain("do-not-print-refresh");
  });

  it("logs out while retaining the selected server", async () => {
    saveConfig({
      server: "https://api.example",
      user: { id: "user-1", username: "root", email: "root@example.com" },
      accessToken: "access",
      refreshToken: "refresh",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["logout"]);

    await run(["status", "--json"]);
    expect(console.log).toHaveBeenLastCalledWith(
      expect.stringContaining('"server": "https://api.example"'),
    );
    expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('"authenticated": false'));
  });
});
