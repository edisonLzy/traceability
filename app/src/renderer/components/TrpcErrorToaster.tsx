import { useQueryClient } from "@tanstack/react-query";
import type { QueryCacheNotifyEvent } from "@tanstack/react-query";
import type { AppRouter } from "@traceability/server/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";
import { useEffect } from "react";
import { toast } from "sonner";

import { copyTextToClipboard } from "../lib/clipboard";

export function TrpcErrorToaster() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      const error = event.query.state.error as TRPCClientErrorLike<AppRouter> | null;
      if (!error) return;

      const message = formatTrpcError(error);
      toast.error(message, {
        action: {
          label: "复制",
          onClick: () => {
            void copyTextToClipboard(message).catch(() => undefined);
          },
        },
      });
    });
  }, [queryClient]);

  return null;
}

export function formatTrpcError(error: {
  message?: string;
  data?: { code?: string } | null;
}): string {
  if (error.data?.code === "UNAUTHORIZED") return "认证失败，请检查管理 token。";
  return error.message?.trim() || "服务请求失败。";
}
