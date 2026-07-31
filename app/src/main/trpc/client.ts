import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { AppRouter } from "@traceability/server/trpc";
import { createTRPCClient, type TRPCClient, httpBatchLink } from "@trpc/client";
import { app, safeStorage } from "electron";

import type { AuthTokens } from "../../shared/auth-ipc.js";

function getPersistedAccessToken(): string | null {
  const filePath = join(app.getPath("userData"), "auth-session.bin");
  if (!safeStorage.isEncryptionAvailable() || !existsSync(filePath)) return null;
  try {
    return (JSON.parse(safeStorage.decryptString(readFileSync(filePath))) as AuthTokens)
      .accessToken;
  } catch {
    return null;
  }
}

export function createMainTrpcClient(): TRPCClient<AppRouter> {
  const baseUrl = (process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/api/trpc`,
        headers: () => {
          const token = getPersistedAccessToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
