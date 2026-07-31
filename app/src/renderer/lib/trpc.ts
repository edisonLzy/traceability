import type { AppRouter } from "@traceability/server/trpc";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";

export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> = createTRPCReact<AppRouter>();

const DEFAULT_SERVER_URL = "http://localhost:3000";
let accessToken: string | null = null;
let refreshSession: (() => Promise<boolean>) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function resolveRendererServerUrl(): string {
  const configuredUrl = import.meta.env?.VITE_SERVER_URL;
  return typeof configuredUrl === "string" && configuredUrl.trim()
    ? configuredUrl.replace(/\/$/, "")
    : DEFAULT_SERVER_URL;
}

export function setRendererAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRendererAccessToken(): string | null {
  return accessToken;
}

export function setRendererSessionRefresher(refresh: (() => Promise<boolean>) | null): void {
  refreshSession = refresh;
}

async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401 || String(input).includes("auth.refresh") || !refreshSession)
    return response;
  refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  });
  if (!(await refreshInFlight)) return response;
  const headers = new Headers(init?.headers);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}

export function createTrpcClient(baseUrl: string): ReturnType<typeof trpc.createClient> {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${baseUrl.replace(/\/$/, "")}/api/trpc`,
        headers: () => (accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        fetch: authenticatedFetch,
      }),
    ],
  });
}

export const rendererTrpcClient: ReturnType<typeof trpc.createClient> = createTrpcClient(
  resolveRendererServerUrl(),
);
