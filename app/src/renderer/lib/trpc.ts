import type { AppRouter } from "@traceability/server/trpc";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";

export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> = createTRPCReact<AppRouter>();

const DEFAULT_SERVER_URL = "http://localhost:3000";
const DEFAULT_MANAGEMENT_TOKEN = "traceability-development-token";

export function resolveRendererServerUrl(): string {
  const configuredUrl = import.meta.env?.VITE_SERVER_URL;
  return typeof configuredUrl === "string" && configuredUrl.trim()
    ? configuredUrl.replace(/\/$/, "")
    : DEFAULT_SERVER_URL;
}

export function resolveRendererToken(): string {
  const configuredToken = import.meta.env?.VITE_MANAGEMENT_TOKEN;
  return typeof configuredToken === "string" && configuredToken.trim()
    ? configuredToken
    : DEFAULT_MANAGEMENT_TOKEN;
}

export function createTrpcClient(
  baseUrl: string,
  token: string,
): ReturnType<typeof trpc.createClient> {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${baseUrl.replace(/\/$/, "")}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${token}` }),
      }),
    ],
  });
}

export const rendererTrpcClient: ReturnType<typeof trpc.createClient> = createTrpcClient(
  resolveRendererServerUrl(),
  resolveRendererToken(),
);
