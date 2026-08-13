import { trpc } from "@renderer/lib/trpc";
import type { AppRouterInputs, AppRouterOutputs } from "@renderer/lib/trpc-types";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { AppRouter } from "@tracerability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";
import { useCallback } from "react";

export interface UseInboxListParams {
  projectId: string;
  view: "active" | "done";
  query?: string;
  limit?: number;
}

export function useInboxList(
  params: UseInboxListParams,
): UseQueryResult<AppRouterOutputs["inbox"]["list"] | undefined, TRPCClientErrorLike<AppRouter>> {
  return trpc.inbox.list.useQuery(
    {
      projectId: params.projectId,
      view: params.view,
      query: params.query || undefined,
      limit: params.limit ?? 100,
    },
    {
      enabled: Boolean(params.projectId),
      staleTime: 10_000,
    },
  );
}

export function useInboxItem(
  inboxItemId: string | undefined,
): UseQueryResult<AppRouterOutputs["inbox"]["get"] | undefined, TRPCClientErrorLike<AppRouter>> {
  return trpc.inbox.get.useQuery(inboxItemId!, { enabled: Boolean(inboxItemId) });
}

export function useResolveInboxItem(): UseMutationResult<
  AppRouterOutputs["inbox"]["resolve"],
  TRPCClientErrorLike<AppRouter>,
  AppRouterInputs["inbox"]["resolve"],
  unknown
> {
  return trpc.inbox.resolve.useMutation();
}

export function useDismissInboxItem(): UseMutationResult<
  AppRouterOutputs["inbox"]["dismiss"],
  TRPCClientErrorLike<AppRouter>,
  AppRouterInputs["inbox"]["dismiss"],
  unknown
> {
  return trpc.inbox.dismiss.useMutation();
}

export function useReopenInboxItem(): UseMutationResult<
  AppRouterOutputs["inbox"]["reopen"],
  TRPCClientErrorLike<AppRouter>,
  AppRouterInputs["inbox"]["reopen"],
  unknown
> {
  return trpc.inbox.reopen.useMutation();
}

export function useInvalidateInbox() {
  const utils = trpc.useUtils();
  return useCallback(async () => {
    await Promise.all([
      utils.inbox.list.invalidate(),
      utils.inbox.get.invalidate(),
      utils.issues.list.invalidate(),
    ]);
  }, [utils]);
}
