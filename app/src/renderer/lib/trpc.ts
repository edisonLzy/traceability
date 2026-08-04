import { authStore } from "@renderer/store/auth";
import type { AppRouter } from "@tracerability/server/trpc";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";

export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> = createTRPCReact<AppRouter>();

const DEFAULT_SERVER_URL = "http://localhost:3000";
let refreshInFlight: Promise<boolean> | null = null;

export function resolveRendererServerUrl(): string {
  const configuredUrl = import.meta.env?.VITE_SERVER_URL;
  return typeof configuredUrl === "string" && configuredUrl.trim()
    ? configuredUrl.replace(/\/$/, "")
    : DEFAULT_SERVER_URL;
}

/**
 * 轮换 session：用现有 refresh token 换新 token pair，成功后走 completeLogin
 * （内存 + IPC + 状态翻转）；失败则清空 session。返回是否成功。
 * 被 401 拦截器（authenticatedFetch）和启动恢复（_auth.tsx）复用。
 */
export async function refreshAuthSession(): Promise<boolean> {
  const { refreshToken } = authStore.getState();
  if (!refreshToken) return false;
  try {
    const tokens = await rendererTrpcClient.auth.refresh.mutate({ refreshToken });
    await authStore.getState().completeLogin(tokens);
    return true;
  } catch {
    await authStore.getState().logout();
    return false;
  }
}

async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401 || String(input).includes("auth.refresh")) return response;
  refreshInFlight ??= refreshAuthSession().finally(() => {
    refreshInFlight = null;
  });
  if (!(await refreshInFlight)) return response;
  const headers = new Headers(init?.headers);
  const token = authStore.getState().accessToken;
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export const rendererTrpcClient: ReturnType<typeof trpc.createClient> = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${resolveRendererServerUrl().replace(/\/$/, "")}/api/trpc`,
      headers: () => {
        const token = authStore.getState().accessToken;
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      fetch: authenticatedFetch,
    }),
  ],
});
