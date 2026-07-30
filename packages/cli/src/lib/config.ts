import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CliConfig {
  server: string;
  token: string;
}

export interface CliConfigOverrides {
  server?: string;
  token?: string;
}

export const DEFAULT_SERVER = "http://localhost:3000";
export const DEFAULT_TOKEN = "traceability-development-token";

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
    token:
      overrides.token ?? process.env.TRACEABILITY_MANAGEMENT_TOKEN ?? stored.token ?? DEFAULT_TOKEN,
  };
}

export function saveConfig(cfg: CliConfig): void {
  const path = configPath();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
