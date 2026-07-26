import type { AppRouter } from "@traceability/server/trpc";
import { createTRPCClient, type TRPCClient, httpBatchLink } from "@trpc/client";

import { getConfig } from "./config.js";

export function getTrpcClient(): TRPCClient<AppRouter> {
  const { server, token } = getConfig();
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${server.replace(/\/$/, "")}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${token}` }),
      }),
    ],
  });
}
