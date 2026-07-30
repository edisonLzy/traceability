import { existsSync, readFileSync } from "node:fs";

import { input, password } from "@inquirer/prompts";

import { DEFAULT_SERVER, configPath, getConfig, saveConfig, type CliConfig } from "./config.js";

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

export class NonInteractiveAuthError extends Error {
  readonly code = "NON_INTERACTIVE_AUTH" as const;

  constructor(message: string) {
    super(message);
    this.name = "NonInteractiveAuthError";
  }
}

/** Returns the token currently stored on disk (if any), independent of env overrides. */
function storedToken(): string | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CliConfig>;
    return typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : null;
  } catch {
    return null;
  }
}

async function runPrompt(opts: { serverDefault: string }): Promise<CliConfig> {
  const server = await input({
    message: "Server URL",
    default: opts.serverDefault,
  });
  const token = await password({
    message: "Management token",
    mask: "*",
  });
  if (!token || token.length === 0) {
    throw new Error("management token is required");
  }
  return { server: server.trim() || DEFAULT_SERVER, token };
}

/**
 * First-run gate:
 * - If config.json has a non-empty token → return getConfig() as-is.
 * - Non-TTY + missing → return getConfig() (defaults), do NOT write to disk.
 * - TTY + missing → prompt for server/token, saveConfig, return the new values.
 */
export async function ensureConfig(): Promise<CliConfig> {
  const existing = storedToken();
  if (existing !== null) return getConfig();

  if (!isInteractive()) return getConfig();

  const cfg = await runPrompt({ serverDefault: DEFAULT_SERVER });
  saveConfig(cfg);
  process.stderr.write(`Saved to ${configPath()}.\n`);
  return cfg;
}
