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
  const utils = trpc.useUtils();
  return trpc.projects.create.useMutation({
    // 创建成功后使项目列表缓存失效：onboarding 依赖 projects.list 的长度决定
    // 是否退出引导，modal 依赖它刷新下拉列表，两者都要立即看到新项目。
    onSuccess: () => {
      void utils.projects.list.invalidate();
    },
  });
}
