import type { AppRouter } from "@traceability/server/trpc";
import { createTRPCClient, type TRPCClient, httpBatchLink } from "@trpc/client";

export function createMainTrpcClient(): TRPCClient<AppRouter> {
  const baseUrl = (process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const token = process.env.TRACEABILITY_MANAGEMENT_TOKEN ?? "traceability-development-token";

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${token}` }),
      }),
    ],
  });
}
