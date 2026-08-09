import { trpc } from "@renderer/lib/trpc";
import type { AppRouterInputs, AppRouterOutputs } from "@renderer/lib/trpc-types";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { AppRouter } from "@tracerability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";

export function useIssue(
  issueId: string | undefined,
): UseQueryResult<AppRouterOutputs["issues"]["get"] | undefined, TRPCClientErrorLike<AppRouter>> {
  return trpc.issues.get.useQuery(issueId!, { enabled: Boolean(issueId) });
}

export function useIssueEvents(
  issueId: string | undefined,
): UseQueryResult<
  AppRouterOutputs["issues"]["events"] | undefined,
  TRPCClientErrorLike<AppRouter>
> {
  return trpc.issues.events.useQuery(
    { issueId: issueId!, limit: 100 },
    { enabled: Boolean(issueId) },
  );
}

export function useRelatedReplays(
  projectId: string | undefined,
  eventId: string | undefined,
): UseQueryResult<AppRouterOutputs["replays"]["list"] | undefined, TRPCClientErrorLike<AppRouter>> {
  return trpc.replays.list.useQuery(
    { projectId: projectId!, errorId: eventId, limit: 10 },
    { enabled: Boolean(projectId && eventId), staleTime: 15_000 },
  );
}

export function useUpdateIssue(): UseMutationResult<
  AppRouterOutputs["issues"]["update"],
  TRPCClientErrorLike<AppRouter>,
  AppRouterInputs["issues"]["update"],
  unknown
> {
  return trpc.issues.update.useMutation();
}
