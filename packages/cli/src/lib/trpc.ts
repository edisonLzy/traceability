import type { AppRouter } from "@traceability/server/trpc";
import { TRPCClientError, createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";

import {
  NonInteractiveAuthError,
  ensureConfig,
  reconfigureAfter401,
} from "./config-interactive.js";
import type { CliConfig } from "./config.js";

interface CfgRef {
  current: CliConfig;
}

function buildClient(ref: CfgRef): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${ref.current.server.replace(/\/$/, "")}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${ref.current.token}` }),
      }),
    ],
  });
}

function isUnauthorized(err: unknown): boolean {
  if (err instanceof TRPCClientError) {
    const data = err.data as { code?: string; httpStatus?: number } | undefined;
    if (data?.code === "UNAUTHORIZED" || data?.httpStatus === 401) return true;
  }
  // Structural fallback in case `instanceof` fails across module boundaries.
  if (typeof err === "object" && err !== null) {
    const anyErr = err as {
      data?: { code?: string; httpStatus?: number };
      shape?: { data?: { code?: string; httpStatus?: number } };
    };
    if (anyErr.data?.code === "UNAUTHORIZED" || anyErr.data?.httpStatus === 401) return true;
    if (anyErr.shape?.data?.code === "UNAUTHORIZED" || anyErr.shape?.data?.httpStatus === 401) {
      return true;
    }
  }
  return false;
}

/**
 * Wraps the TRPC client with a Proxy that intercepts terminal method calls
 * (`.query(...)` / `.mutate(...)`) and, on UNAUTHORIZED, prompts for new
 * credentials and retries the call exactly once against a freshly built
 * client. Non-terminal property access is forwarded verbatim so procedure
 * paths (`client.projects.list.query`) keep working.
 */
function wrapWithReauth(ref: CfgRef): TRPCClient<AppRouter> {
  const primary = buildClient(ref);

  const wrap = (target: object, pathSegments: string[]): unknown =>
    new Proxy(target, {
      get(inner, prop, receiver) {
        // Never intercept symbols or promise-integration keys — this proxy is
        // returned from an async function, so `await` inspects `.then`.
        if (typeof prop !== "string") return Reflect.get(inner, prop, receiver);
        if (prop === "then" || prop === "catch" || prop === "finally") {
          return Reflect.get(inner, prop, receiver);
        }
        const value = Reflect.get(inner, prop, receiver);
        if (prop === "query" || prop === "mutate" || prop === "subscribe") {
          return async (...args: unknown[]) => {
            const call = (client: TRPCClient<AppRouter>): unknown => {
              let node: unknown = client;
              for (const segment of pathSegments) {
                node = (node as Record<string, unknown>)[segment];
              }
              const fn = (node as Record<string, unknown>)[prop] as (...a: unknown[]) => unknown;
              return fn.apply(node, args);
            };
            try {
              return await call(primary);
            } catch (err) {
              if (!isUnauthorized(err)) throw err;
              try {
                ref.current = await reconfigureAfter401(ref.current);
              } catch (reauthErr) {
                if (reauthErr instanceof NonInteractiveAuthError) throw err;
                throw reauthErr;
              }
              const rebuilt = buildClient(ref);
              return await call(rebuilt);
            }
          };
        }
        // Recurse into anything object-like (the tRPC recursive proxy returns
        // a callable function for every intermediate path, so include function
        // values, not just plain objects).
        if (value !== null && (typeof value === "object" || typeof value === "function")) {
          return wrap(value as object, [...pathSegments, prop]);
        }
        return value;
      },
    }) as unknown;

  return wrap(primary as unknown as object, []) as TRPCClient<AppRouter>;
}

export async function getTrpcClient(): Promise<TRPCClient<AppRouter>> {
  const ref: CfgRef = { current: await ensureConfig() };
  return wrapWithReauth(ref);
}
