import type { AuthTokens } from "@shared/auth-ipc";
import { createStore } from "zustand/vanilla";

export type AuthState = "checking" | "authenticated" | "unauthenticated";

export interface AuthStoreState {
  state: AuthState;
  accessToken: string | null;
  refreshToken: string | null;
  /**
   * 从磁盘（主进程 safeStorage）读回持久化 session。返回 null 表示没有可恢复的 session。
   * 纯 IPC 读，不调用 tRPC。
   */
  loadPersistedSession(): Promise<AuthTokens | null>;
  /**
   * 采纳一对新 token：写内存缓存 + 通过 IPC 持久化，并把状态翻转为 authenticated。
   * 登录、token 刷新成功后都收敛到这一个入口。
   */
  completeLogin(tokens: AuthTokens): Promise<void>;
  /**
   * 清除 session：清空内存缓存 + 通过 IPC 删除持久化文件，状态翻转为 unauthenticated。
   */
  logout(): Promise<void>;
}

export const authStore = createStore<AuthStoreState>()((set) => ({
  state: "checking",
  accessToken: null,
  refreshToken: null,

  async loadPersistedSession(): Promise<AuthTokens | null> {
    return window.electronAPI.invoke("getAuthSession");
  },

  async completeLogin(tokens: AuthTokens) {
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    await window.electronAPI.invoke("saveAuthSession", tokens);
    set({ state: "authenticated" });
  },

  async logout() {
    set({ accessToken: null, refreshToken: null });
    await window.electronAPI.invoke("clearAuthSession");
    set({ state: "unauthenticated" });
  },
}));
