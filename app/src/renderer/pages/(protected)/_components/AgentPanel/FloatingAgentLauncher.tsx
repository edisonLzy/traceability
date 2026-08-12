import { cn } from "@renderer/lib/utils";
import { agentStore } from "@renderer/store/agent";
import { Sparkles } from "lucide-react";
import { useMemo, type CSSProperties, type DOMAttributes, type Ref } from "react";
import { useStore } from "zustand";

import { deriveFloatingAgentSummary } from "./floating-agent-summary";

export interface FloatingAgentLauncherProps {
  buttonRef: Ref<HTMLButtonElement>;
  isOpen: boolean;
  launcherButtonProps: DOMAttributes<HTMLButtonElement>;
  launcherStyle?: CSSProperties;
  onOpen: () => void;
  summarySide: "left" | "right";
}

export function FloatingAgentLauncher({
  buttonRef,
  isOpen,
  launcherButtonProps,
  launcherStyle,
  onOpen,
  summarySide,
}: FloatingAgentLauncherProps) {
  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId);
  const entryState = useStore(agentStore, (state) =>
    activeSessionId ? state.getEntryState(activeSessionId) : null,
  );
  const streamingEntryId = useStore(agentStore, (state) =>
    activeSessionId ? state.streamingEntryIds.get(activeSessionId) : undefined,
  );
  const isRunning = entryState?.status === "running";
  const summary = useMemo(
    () =>
      entryState
        ? deriveFloatingAgentSummary(entryState.entries, entryState.status, streamingEntryId)
        : null,
    [entryState, streamingEntryId],
  );

  return (
    <div
      className="pointer-events-none absolute right-[18px] bottom-[18px] z-[45] size-12"
      style={launcherStyle}
    >
      {summary && !isOpen ? (
        <button
          aria-label={`Open Agent panel. Live update: ${summary}`}
          className={cn(
            "glass-panel-raised pointer-events-auto absolute bottom-0 w-[min(328px,calc(100vw_-_160px))] rounded-[15px] px-3 py-2.5 text-left text-ink transition-[background-color,opacity] hover:bg-surface-2 motion-reduce:transition-none",
            summarySide === "left" ? "right-[calc(100%+10px)]" : "left-[calc(100%+10px)]",
          )}
          onClick={onOpen}
          type="button"
        >
          <span className="mb-1 flex items-center gap-1.5 text-[8px] font-bold tracking-[0.07em] text-tertiary uppercase">
            <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
            Agent is investigating
          </span>
          <span className="line-clamp-2 text-[10px] leading-[1.5] text-ink">{summary}</span>
        </button>
      ) : null}

      <button
        ref={buttonRef}
        aria-controls="floating-agent-panel"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close Agent panel" : "Open Agent panel"}
        className="glass-panel-raised pointer-events-auto relative grid size-12 touch-none cursor-grab place-items-center rounded-[16px] border-primary/35 bg-primary/10 text-primary-hover select-none shadow-glow transition-colors hover:bg-primary/15 active:cursor-grabbing motion-reduce:transition-none"
        title={`${isOpen ? "Close" : "Open"} Agent panel. Drag to move.`}
        type="button"
        {...launcherButtonProps}
      >
        <Sparkles size={20} />
        {isRunning ? (
          <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-surface-1 bg-primary motion-safe:animate-pulse">
            <span className="sr-only">Agent is responding</span>
          </span>
        ) : null}
      </button>
    </div>
  );
}
