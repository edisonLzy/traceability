import { isCancel, password, text } from "@clack/prompts";
import type { AppRouter } from "@traceability/server/trpc";
import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";

import { clearSession, getConfig, saveSession } from "./config.js";
import type { CliConfig } from "./config.js";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface Credentials {
  email: string;
  password: string;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

let refreshInFlight: Promise<AuthSession> | undefined;

export class AuthRequiredError extends Error {
  readonly code = "AUTH_REQUIRED" as const;

  constructor(message = "authentication required. Run: traceability auth login") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class AuthCancelledError extends Error {
  constructor() {
    super("authentication cancelled");
    this.name = "AuthCancelledError";
  }
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

export function getSession(config: CliConfig): AuthSession {
  if (!config.user || !config.accessToken || !config.refreshToken) {
    throw new AuthRequiredError();
  }
  return {
    user: config.user,
    accessToken: config.accessToken,
    refreshToken: config.refreshToken,
  };
}

export async function login(server: string, credentials: Credentials): Promise<AuthSession> {
  const result = await publicClient(server).mutation("auth.login", credentials);
  return parseLoginResult(result);
}

export async function refresh(server: string, refreshToken: string): Promise<RefreshResponse> {
  const result = await publicClient(server).mutation("auth.refresh", { refreshToken });
  return parseRefreshResult(result);
}

export async function loginWithPrompt(
  server = getConfig().server,
  email?: string,
): Promise<AuthSession> {
  if (!isInteractive()) throw new AuthRequiredError();
  const session = await login(server, await promptForCredentials(email));
  saveSession(server, session);
  return session;
}

export async function refreshOrLogin(current: AuthSession): Promise<AuthSession> {
  if (refreshInFlight) return refreshInFlight;
  const operation = refreshOrLoginOnce(current);
  refreshInFlight = operation;
  try {
    return await operation;
  } finally {
    if (refreshInFlight === operation) refreshInFlight = undefined;
  }
}

async function refreshOrLoginOnce(current: AuthSession): Promise<AuthSession> {
  const server = getConfig().server;
  try {
    const next = await refresh(server, current.refreshToken);
    const session = { ...next, user: current.user };
    saveSession(server, session);
    return session;
  } catch {
    clearSession();
    if (!isInteractive()) throw new AuthRequiredError();
    return loginWithPrompt(server, current.user.email);
  }
}

export async function promptForCredentials(email?: string): Promise<Credentials> {
  const promptedEmail =
    email ??
    (await text({
      message: "Email",
      validate(value) {
        return value.trim().length > 0 ? undefined : "Email is required";
      },
    }));
  if (isCancel(promptedEmail)) throw new AuthCancelledError();

  const promptedPassword = await password({
    message: "Password",
    validate(value) {
      return value.length > 0 ? undefined : "Password is required";
    },
  });
  if (isCancel(promptedPassword)) throw new AuthCancelledError();

  return { email: promptedEmail.trim(), password: promptedPassword };
}

function publicClient(server: string) {
  return createTRPCUntypedClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${server.replace(/\/$/, "")}/api/trpc`,
      }),
    ],
  });
}

function parseLoginResult(value: unknown): AuthSession {
  if (
    !isRecord(value) ||
    !isAuthUser(value.user) ||
    !isString(value.accessToken) ||
    !isString(value.refreshToken)
  ) {
    throw new Error("invalid auth.login response");
  }
  return {
    user: value.user,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
  };
}

function parseRefreshResult(value: unknown): RefreshResponse {
  if (!isRecord(value) || !isString(value.accessToken) || !isString(value.refreshToken)) {
    throw new Error("invalid auth.refresh response");
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken };
}

function isAuthUser(value: unknown): value is AuthUser {
  return isRecord(value) && isString(value.id) && isString(value.username) && isString(value.email);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
