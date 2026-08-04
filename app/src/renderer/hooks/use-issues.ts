import { trpc } from "@renderer/lib/trpc";
import type { AppRouterOutputs } from "@renderer/lib/trpc-types";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { AppRouter } from "@tracerability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";
import { useCallback } from "react";

export interface UseIssuesParams {
  projectId: string;
  cursor?: string;
  limit?: number;
}

export function useIssues(
  params: UseIssuesParams,
): UseQueryResult<AppRouterOutputs["issues"]["list"] | undefined, TRPCClientErrorLike<AppRouter>> {
  return trpc.issues.list.useQuery(
    {
      projectId: params.projectId,
      cursor: params.cursor,
      limit: params.limit ?? 100,
    },
    {
      enabled: Boolean(params.projectId),
      staleTime: 15_000,
    },
  );
}

export function useInvalidateIssues() {
  const queryClient = useQueryClient();
  return useCallback(
    async () => queryClient.invalidateQueries({ queryKey: ["issues"] }),
    [queryClient],
  );
}
