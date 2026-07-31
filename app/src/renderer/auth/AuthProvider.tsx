import {
  rendererTrpcClient,
  setRendererAccessToken,
  setRendererSessionRefresher,
} from "@renderer/lib/trpc";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import type { AuthTokens } from "../../shared/auth-ipc.js";

export type AuthState = "checking" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  state: AuthState;
  accept(tokens: AuthTokens): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("checking");
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const accept = useCallback(async (tokens: AuthTokens) => {
    setRendererAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    await window.electronAPI.invoke("saveAuthSession", tokens);
    setState("authenticated");
  }, []);

  useEffect(() => {
    setRendererSessionRefresher(
      refreshToken
        ? async () => {
            try {
              await accept(await rendererTrpcClient.auth.refresh.mutate({ refreshToken }));
              return true;
            } catch {
              setRendererAccessToken(null);
              setRefreshToken(null);
              await window.electronAPI.invoke("clearAuthSession");
              setState("unauthenticated");
              return false;
            }
          }
        : null,
    );
    return () => setRendererSessionRefresher(null);
  }, [accept, refreshToken]);

  useEffect(() => {
    void (async () => {
      const stored = await window.electronAPI.invoke("getAuthSession");
      if (stored) {
        try {
          const refreshed = await rendererTrpcClient.auth.refresh.mutate({
            refreshToken: stored.refreshToken,
          });
          await accept(refreshed);
        } catch {
          await window.electronAPI.invoke("clearAuthSession");
        }
      }
      setState((current) => (current === "checking" ? "unauthenticated" : current));
    })();
  }, [accept]);

  return <AuthContext.Provider value={{ state, accept }}>{children}</AuthContext.Provider>;
}
