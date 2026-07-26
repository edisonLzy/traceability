import { trpc } from "@renderer/lib/trpc";
import type { RouterOutputs } from "@renderer/lib/trpc-types";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AppRouter } from "@traceability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";

type ProjectsQueryResult = UseQueryResult<
  RouterOutputs["projects"]["list"] | undefined,
  TRPCClientErrorLike<AppRouter>
>;

export function useProjects(): ProjectsQueryResult {
  return trpc.projects.list.useQuery(undefined, { staleTime: 30_000 });
}
