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

/**
 * 401 fallback: force a re-prompt (server field pre-filled with the current
 * value) and persist. Throws NonInteractiveAuthError when stdin isn't a TTY,
 * or when the current token came from the TRACEABILITY_MANAGEMENT_TOKEN env
 * override — the env value expresses strong external intent and we refuse to
 * silently overwrite it with a prompt-provided value.
 */
export async function reconfigureAfter401(current: CliConfig): Promise<CliConfig> {
  if (!isInteractive()) {
    throw new NonInteractiveAuthError(
      "management authentication failed and stdin is not a TTY; refusing to prompt",
    );
  }
  const envToken = process.env.TRACEABILITY_MANAGEMENT_TOKEN;
  if (envToken !== undefined && envToken === current.token) {
    throw new NonInteractiveAuthError(
      "TRACEABILITY_MANAGEMENT_TOKEN is set; refusing to prompt (unset the env var to reconfigure)",
    );
  }
  process.stderr.write("Server rejected the management token. Please re-enter your credentials.\n");
  const cfg = await runPrompt({ serverDefault: current.server });
  saveConfig(cfg);
  process.stderr.write(`Saved to ${configPath()}.\n`);
  return cfg;
}
