import type { AppRouter } from "@traceability/server/trpc";
import { TRPCClientError, createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";

import { getSession, refreshOrLogin, type AuthSession } from "./auth.js";
import { getConfig } from "./config.js";

interface SessionRef {
  current: AuthSession;
}

function buildClient(ref: SessionRef): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getConfig().server.replace(/\/$/, "")}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${ref.current.accessToken}` }),
      }),
    ],
  });
}

function isUnauthorized(err: unknown): boolean {
  if (err instanceof TRPCClientError) {
    const data = err.data as { code?: string; httpStatus?: number } | undefined;
    if (data?.code === "UNAUTHORIZED" || data?.httpStatus === 401) return true;
  }
  if (typeof err === "object" && err !== null) {
    const anyErr = err as {
      data?: { code?: string; httpStatus?: number };
      shape?: { data?: { code?: string; httpStatus?: number } };
    };
    return (
      anyErr.data?.code === "UNAUTHORIZED" ||
      anyErr.data?.httpStatus === 401 ||
      anyErr.shape?.data?.code === "UNAUTHORIZED" ||
      anyErr.shape?.data?.httpStatus === 401
    );
  }
  return false;
}

/**
 * Wrap terminal tRPC calls so a single UNAUTHORIZED can rotate the refresh
 * token through the public auth client and retry exactly the original call.
 */
function wrapWithRefresh(ref: SessionRef): TRPCClient<AppRouter> {
  const primary = buildClient(ref);

  const wrap = (target: object, pathSegments: string[]): unknown =>
    new Proxy(target, {
      get(inner, prop, receiver) {
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
              ref.current = await refreshOrLogin(ref.current);
              return await call(buildClient(ref));
            }
          };
        }
        if (value !== null && (typeof value === "object" || typeof value === "function")) {
          return wrap(value as object, [...pathSegments, prop]);
        }
        return value;
      },
    }) as unknown;

  return wrap(primary as unknown as object, []) as TRPCClient<AppRouter>;
}

export async function getTrpcClient(): Promise<TRPCClient<AppRouter>> {
  const ref: SessionRef = { current: getSession(getConfig()) };
  return wrapWithRefresh(ref);
}
