import { trpc } from "@renderer/lib/trpc";
import type { AppRouterInputs, AppRouterOutputs } from "@renderer/lib/trpc-types";
import type { UseMutationResult } from "@tanstack/react-query";
import type { AppRouter } from "@tracerability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";

export type CreateProjectInput = AppRouterInputs["projects"]["create"];
export type CreateProjectResult = AppRouterOutputs["projects"]["create"];

export function useCreateProject(): UseMutationResult<
  CreateProjectResult,
  TRPCClientErrorLike<AppRouter>,
  CreateProjectInput,
  unknown
> {
  return trpc.projects.create.useMutation();
}
