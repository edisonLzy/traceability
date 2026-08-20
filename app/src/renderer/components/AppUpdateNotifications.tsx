import { useAppUpdate } from "@renderer/hooks/use-app-update";
import type { AppUpdateState } from "@shared/update-ipc";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const UPDATE_TOAST_ID = "traceability-app-update";

/** Turns main-process update events into non-blocking, user-actionable notices. */
export function useAppUpdateNotifications() {
  const { state, downloadUpdate, installUpdate, openReleasePage } = useAppUpdate();
  const previousState = useRef<AppUpdateState | null>(null);

  useEffect(() => {
    const previous = previousState.current;
    previousState.current = state;
    showUpdateToast(state, previous, { downloadUpdate, installUpdate, openReleasePage });
  }, [downloadUpdate, installUpdate, openReleasePage, state]);
}

function showUpdateToast(
  state: AppUpdateState,
  previous: AppUpdateState | null,
  actions: Pick<
    ReturnType<typeof useAppUpdate>,
    "downloadUpdate" | "installUpdate" | "openReleasePage"
  >,
): void {
  if (state.status === "available" && state.version && previous?.status !== "available") {
    toast("发现 Traceability 新版本", {
      id: UPDATE_TOAST_ID,
      description: state.releaseName ?? `版本 v${state.version} 已准备好下载。`,
      duration: Infinity,
      action: {
        label: "下载更新",
        onClick: () => {
          void actions.downloadUpdate().catch(() => undefined);
        },
      },
      cancel: {
        label: "查看说明",
        onClick: () => {
          void actions.openReleasePage().catch(() => undefined);
        },
      },
    });
    return;
  }

  if (state.status === "downloading") {
    const percent = Math.round(state.progress?.percent ?? 0);
    toast("正在下载更新", {
      id: UPDATE_TOAST_ID,
      description: `${percent}% · 下载完成后可重启安装。`,
      duration: Infinity,
    });
    return;
  }

  if (state.status === "downloaded" && previous?.status !== "downloaded") {
    toast.success("更新已下载", {
      id: UPDATE_TOAST_ID,
      description: `重启 Traceability 后安装 v${state.version ?? "新版本"}。`,
      duration: Infinity,
      action: {
        label: "重启安装",
        onClick: () => {
          void actions.installUpdate().catch(() => undefined);
        },
      },
    });
    return;
  }

  if (state.status === "not-available" && state.userInitiated) {
    toast.success("当前已是最新版本", { id: UPDATE_TOAST_ID, duration: 3_500 });
    return;
  }

  if (state.status === "error" && state.userInitiated) {
    const title =
      previous?.status === "downloading"
        ? "更新下载失败"
        : previous?.status === "downloaded"
          ? "更新安装失败"
          : "检查更新失败";
    toast.error(title, {
      id: UPDATE_TOAST_ID,
      description: state.error ?? "请稍后重试。",
      duration: 6_000,
    });
  }
}
