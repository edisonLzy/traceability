import { trpc } from "@renderer/lib/trpc";
import type { RouterInputs, RouterOutputs } from "@renderer/lib/trpc-types";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { AppRouter } from "@traceability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";

export function useIssue(
  issueId: string | undefined,
): UseQueryResult<RouterOutputs["issues"]["get"] | undefined, TRPCClientErrorLike<AppRouter>> {
  return trpc.issues.get.useQuery(issueId!, { enabled: Boolean(issueId) });
}

export function useIssueEvents(
  issueId: string | undefined,
): UseQueryResult<RouterOutputs["issues"]["events"] | undefined, TRPCClientErrorLike<AppRouter>> {
  return trpc.issues.events.useQuery(
    { issueId: issueId!, limit: 100 },
    { enabled: Boolean(issueId) },
  );
}

export function useUpdateIssue(): UseMutationResult<
  RouterOutputs["issues"]["update"],
  TRPCClientErrorLike<AppRouter>,
  RouterInputs["issues"]["update"],
  unknown
> {
  return trpc.issues.update.useMutation();
}
