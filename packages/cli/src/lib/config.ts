import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { AuthSession } from "./auth.js";

export interface CliConfig {
  server: string;
  user?: AuthSession["user"];
  accessToken?: string;
  refreshToken?: string;
}

export interface CliConfigOverrides {
  server?: string;
}

export const DEFAULT_SERVER = "http://localhost:3000";

let commandLineOverrides: CliConfigOverrides = {};

export function setConfigOverrides(overrides: CliConfigOverrides): void {
  commandLineOverrides = { ...overrides };
}

export function configPath(): string {
  return process.env.TRACEABILITY_CONFIG_PATH ?? join(homedir(), ".traceability", "config.json");
}

export function getConfig(overrides: CliConfigOverrides = commandLineOverrides): CliConfig {
  const path = configPath();
  const stored = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Partial<CliConfig>)
    : {};
  return {
    server:
      overrides.server ?? process.env.TRACEABILITY_SERVER_URL ?? stored.server ?? DEFAULT_SERVER,
    ...(stored.user ? { user: stored.user } : {}),
    ...(stored.accessToken ? { accessToken: stored.accessToken } : {}),
    ...(stored.refreshToken ? { refreshToken: stored.refreshToken } : {}),
  };
}

export function saveConfig(cfg: CliConfig): void {
  const path = configPath();
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  renameSync(temporary, path);
}

export function saveSession(server: string, session: AuthSession): void {
  saveConfig({ server, ...session });
}

export function clearSession(): void {
  saveConfig({ server: getConfig().server });
}
