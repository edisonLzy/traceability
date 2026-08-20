import { ModeToggle } from "@renderer/components/Themes";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useAppUpdate } from "@renderer/hooks/use-app-update";
import { Download, Fingerprint, LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export function Titlebar() {
  const { invoke, on } = useElectronIPC();
  const { state: updateState, checkForUpdates, downloadUpdate, installUpdate } = useAppUpdate();

  useEffect(() => {
    const syncFullScreen = (fullScreen: boolean) => {
      document.documentElement.dataset.windowFullscreen = String(fullScreen);
    };

    void invoke("getWindowState")
      .then((state) => syncFullScreen(state.isFullScreen))
      .catch(() => syncFullScreen(false));

    return on("window_state_updated", (state) => syncFullScreen(state.isFullScreen));
  }, [invoke, on]);

  return (
    <header className="app-drag-region fixed inset-x-0 top-0 z-30 flex h-[var(--titlebar-height)] items-center border-b border-hairline bg-surface-glass/90 px-2 backdrop-blur-2xl">
      <div className="app-no-drag flex min-w-0 items-center gap-2 pl-[calc(var(--window-controls-left)+0.5rem)]">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary-hover shadow-glass-sm">
          <Fingerprint size={14} />
        </span>
        <span className="truncate text-[11px] font-[650] tracking-[-0.01em] text-muted">
          Traceability
        </span>
        <span className="hidden text-[10px] text-tertiary min-[680px]:inline">
          AI runtime studio
        </span>
      </div>
      <div className="app-no-drag ml-auto flex items-center gap-1 pr-[calc(var(--window-controls-right)+0.25rem)]">
        <AppUpdateControl
          state={updateState}
          onCheck={checkForUpdates}
          onDownload={downloadUpdate}
          onInstall={installUpdate}
        />
        <ModeToggle />
      </div>
    </header>
  );
}

function AppUpdateControl({
  state,
  onCheck,
  onDownload,
  onInstall,
}: {
  state: ReturnType<typeof useAppUpdate>["state"];
  onCheck: ReturnType<typeof useAppUpdate>["checkForUpdates"];
  onDownload: ReturnType<typeof useAppUpdate>["downloadUpdate"];
  onInstall: ReturnType<typeof useAppUpdate>["installUpdate"];
}) {
  if (state.status === "unsupported") return null;

  if (state.status === "available" && state.version) {
    return (
      <button
        type="button"
        onClick={() => void onDownload()}
        title={`下载 Traceability v${state.version}`}
        className="glass-control inline-flex h-7 max-w-[150px] items-center gap-1.5 rounded-lg px-2 text-[10px] text-primary-hover transition-colors hover:bg-primary/10"
      >
        <Download size={12} />
        <span className="truncate">v{state.version} 可用</span>
      </button>
    );
  }

  if (state.status === "downloading") {
    const percent = Math.round(state.progress?.percent ?? 0);
    return (
      <div
        title={`正在下载更新 ${percent}%`}
        className="glass-control relative inline-flex h-7 max-w-[150px] items-center gap-1.5 overflow-hidden rounded-lg px-2 text-[10px] text-muted"
      >
        <span
          className="absolute inset-y-0 left-0 bg-primary/10 transition-[width]"
          style={{ width: `${percent}%` }}
        />
        <LoaderCircle size={12} className="relative animate-spin" />
        <span className="relative truncate">下载 {percent}%</span>
      </div>
    );
  }

  if (state.status === "downloaded") {
    return (
      <button
        type="button"
        onClick={() => void onInstall()}
        title="重启并安装更新"
        className="glass-control inline-flex h-7 max-w-[150px] items-center gap-1.5 rounded-lg px-2 text-[10px] text-primary-hover transition-colors hover:bg-primary/10"
      >
        <RotateCcw size={12} />
        <span className="truncate">重启安装</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onCheck()}
      disabled={state.status === "checking"}
      title={state.status === "checking" ? "正在检查更新" : "检查更新"}
      className="glass-control inline-flex size-7 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-overlay-strong hover:text-ink disabled:cursor-wait disabled:opacity-60"
    >
      <RefreshCw size={12} className={state.status === "checking" ? "animate-spin" : undefined} />
    </button>
  );
}
