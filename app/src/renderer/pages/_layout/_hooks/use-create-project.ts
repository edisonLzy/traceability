import { trpc } from "@renderer/lib/trpc";
import type { RouterInputs, RouterOutputs } from "@renderer/lib/trpc-types";
import type { UseMutationResult } from "@tanstack/react-query";
import type { AppRouter } from "@traceability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";

export type CreateProjectInput = RouterInputs["projects"]["create"];
export type CreateProjectResult = RouterOutputs["projects"]["create"];

export function useCreateProject(): UseMutationResult<
  CreateProjectResult,
  TRPCClientErrorLike<AppRouter>,
  CreateProjectInput,
  unknown
> {
  return trpc.projects.create.useMutation();
}
