import { init } from "@traceability/monitor";

/**
 * Initialize the Traceability browser SDK with build-time env vars.
 *
 * Environment variables (declared in .env.local for local dev):
 *   VITE_TRACEABILITY_DSN — required. Full DSN issued by the server, e.g.
 *     http://<publicKey>@127.0.0.1:3300/1
 *   VITE_RELEASE          — optional. Release tag stamped on every event,
 *     usually `<app>@<commit>` in CI.
 */
export function initTraceability(): void {
  const dsn = import.meta.env.VITE_TRACEABILITY_DSN as string | undefined;
  if (!dsn) {
    // Loud dev-time warning; skip init so the app still boots (Sentry throws
    // if dsn is missing in strict mode).
    console.warn("[traceability] VITE_TRACEABILITY_DSN is not set; monitoring disabled.");
    return;
  }
  init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_RELEASE as string | undefined) ?? undefined,
  });
}
