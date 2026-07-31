import { useQueryClient } from "@tanstack/react-query";
import type { MutationCacheNotifyEvent, QueryCacheNotifyEvent } from "@tanstack/react-query";
import type { AppRouter } from "@traceability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";
import { useEffect } from "react";
import { toast } from "sonner";

import { copyTextToClipboard } from "../lib/clipboard";

export function TrpcErrorToaster() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const notifyError = (error: TRPCClientErrorLike<AppRouter>) => {
      const message = formatTrpcError(error);
      toast.error(message, {
        action: {
          label: "复制",
          onClick: () => {
            void copyTextToClipboard(message).catch(() => undefined);
          },
        },
      });
    };

    const unsubscribeQueries = queryClient
      .getQueryCache()
      .subscribe((event: QueryCacheNotifyEvent) => {
        if (event.type !== "updated" || event.action.type !== "error") return;
        const error = event.query.state.error as TRPCClientErrorLike<AppRouter> | null;
        if (error) notifyError(error);
      });

    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      const mutationEvent = event as MutationCacheNotifyEvent;
      if (mutationEvent.type !== "updated" || mutationEvent.action.type !== "error") return;
      const error = mutationEvent.mutation.state.error as TRPCClientErrorLike<AppRouter> | null;
      if (error) notifyError(error);
    });

    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient]);

  return null;
}

export function formatTrpcError(error: {
  message?: string;
  data?: { code?: string; httpStatus?: number } | null;
}): string {
  if (error.data?.code === "UNAUTHORIZED") return "邮箱或密码不正确。";
  if (error.data?.code === "BAD_REQUEST") return "请求参数有误。";
  if (!error.data && error.message?.toLowerCase().includes("fetch"))
    return "网络连接失败，请检查服务器是否启动。";
  return error.message?.trim() || "服务请求失败。";
}
