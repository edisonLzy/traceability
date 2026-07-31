import type { CAC } from "cac";

import {
  AuthCancelledError,
  AuthRequiredError,
  getSession,
  isInteractive,
  login,
  promptForCredentials,
  type AuthSession,
} from "../lib/auth.js";
import { clearSession, getConfig, saveSession } from "../lib/config.js";
import { printJson } from "../lib/output.js";

interface AuthOptions {
  email?: string;
  passwordStdin?: boolean;
  json?: boolean;
}

export function authCommand(cli: CAC): void {
  cli
    .command("auth [action]", "log in, inspect, or clear the local session")
    .option("--email <email>", "account email")
    .option("--password-stdin", "read the password from standard input")
    .option("--json", "output JSON")
    .action(async (action: string | undefined, options: AuthOptions) => {
      switch (action) {
        case undefined:
          return handleDefault(options);
        case "login":
          return loginAndPrint(options);
        case "status":
          return printStatus(options.json);
        case "logout":
          clearSession();
          console.log("Signed out.");
          return;
        default:
          throw new Error(`Unknown auth action: ${action}`);
      }
    });
}

async function handleDefault(options: AuthOptions): Promise<void> {
  const config = getConfig();
  try {
    const session = getSession(config);
    printSession(session, config.server, options.json);
  } catch (error) {
    if (!(error instanceof AuthRequiredError)) throw error;
    if (!isInteractive()) throw error;
    await loginAndPrint(options);
  }
}

async function loginAndPrint(options: AuthOptions): Promise<void> {
  const server = getConfig().server;
  const credentials = options.passwordStdin
    ? await credentialsFromStdin(options.email)
    : isInteractive()
      ? await promptForCredentials(options.email)
      : (() => {
          throw new AuthRequiredError(
            "non-interactive login requires --email <email> --password-stdin",
          );
        })();
  const session = await login(server, credentials);
  saveSession(server, session);
  printSession(session, server, options.json);
}

async function credentialsFromStdin(email: string | undefined) {
  if (!email) throw new AuthRequiredError("--password-stdin requires --email <email>");
  let password = "";
  for await (const chunk of process.stdin) password += String(chunk);
  password = password.replace(/\r?\n$/, "");
  if (!password) throw new AuthRequiredError("password from standard input is required");
  return { email, password };
}

function printStatus(json = false): void {
  const config = getConfig();
  const status = {
    server: config.server,
    authenticated: Boolean(config.user && config.accessToken && config.refreshToken),
    user: config.user ?? null,
    identitySource: config.user ? "local-session" : null,
  };
  if (json) printJson(status);
  else if (status.authenticated && status.user)
    console.log(`${status.user.username} <${status.user.email}>\nserver: ${status.server}`);
  else console.log(`Not authenticated.\nserver: ${status.server}`);
}

function printSession(session: AuthSession, server: string, json = false): void {
  const output = {
    server,
    authenticated: true,
    user: session.user,
    identitySource: "local-session",
  };
  if (json) printJson(output);
  else console.log(`${session.user.username} <${session.user.email}>\nserver: ${server}`);
}

export { AuthCancelledError };
