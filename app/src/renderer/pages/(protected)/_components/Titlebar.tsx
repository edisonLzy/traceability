import { ModeToggle } from "@renderer/components/Themes";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { Fingerprint } from "lucide-react";
import { useEffect } from "react";

export function Titlebar() {
  const { invoke, on } = useElectronIPC();

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
        <ModeToggle />
      </div>
    </header>
  );
}
