import type { AuthTokens } from "@shared/auth-ipc";
import { createStore } from "zustand/vanilla";

const browserSessionKey = "traceability:auth-session";

function getElectronAPI() {
  return window.electronAPI;
}

function readBrowserSession(): AuthTokens | null {
  const persisted = window.sessionStorage.getItem(browserSessionKey);
  if (!persisted) return null;

  try {
    return JSON.parse(persisted) as AuthTokens;
  } catch {
    window.sessionStorage.removeItem(browserSessionKey);
    return null;
  }
}

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
    const electronAPI = getElectronAPI();
    return electronAPI
      ? electronAPI.invoke("getAuthSession")
      : Promise.resolve(readBrowserSession());
  },

  async completeLogin(tokens: AuthTokens) {
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      await electronAPI.invoke("saveAuthSession", tokens);
    } else {
      window.sessionStorage.setItem(browserSessionKey, JSON.stringify(tokens));
    }
    set({ state: "authenticated" });
  },

  async logout() {
    set({ accessToken: null, refreshToken: null });
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      await electronAPI.invoke("clearAuthSession");
    } else {
      window.sessionStorage.removeItem(browserSessionKey);
    }
    set({ state: "unauthenticated" });
  },
}));
