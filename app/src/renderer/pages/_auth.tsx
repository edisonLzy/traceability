import { authStore } from "@renderer/store/auth";
import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useStore } from "zustand";

let initPromise: Promise<void> | null = null;

/**
 * 启动恢复：从磁盘读回持久化 session 并载入内存。不主动刷新——access token 过期时，
 * 下一个受保护请求会 401，由 lib/trpc.ts 的拦截器自动轮换。去重保证 StrictMode
 * 双跑 effect 时只执行一次恢复。
 */
function initAuthSession(): Promise<void> {
  initPromise ??= (async () => {
    const stored = await authStore.getState().loadPersistedSession();
    if (!stored) {
      authStore.setState({ state: "unauthenticated" });
      return;
    }
    authStore.setState({
      state: "authenticated",
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
    });
  })();
  return initPromise;
}

/** 挂载时执行一次启动恢复（401 刷新由 lib/trpc.ts 的拦截器直接触发）。 */
function useAuthSession() {
  useEffect(() => {
    void initAuthSession();
  }, []);
}

function AuthLoading() {
  return <div className="h-screen bg-canvas" />;
}

export function AuthGuard() {
  useAuthSession();
  const state = useStore(authStore, (s) => s.state);
  if (state === "checking") return <AuthLoading />;
  return state === "authenticated" ? <Outlet /> : <Navigate to="/login" replace />;
}

export function GuestGuard() {
  useAuthSession();
  const state = useStore(authStore, (s) => s.state);
  if (state === "checking") return <AuthLoading />;
  return state === "authenticated" ? <Navigate to="/inbox" replace /> : <Outlet />;
}
