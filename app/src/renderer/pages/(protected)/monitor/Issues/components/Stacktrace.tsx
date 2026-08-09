import { cn } from "@renderer/lib/utils";
import { FileCode2 } from "lucide-react";
import { useState } from "react";

import { readStackFrames, readSymbolicationStatus, type SymbolicatedStatus } from "./event-data";
import { SourceCodeViewer } from "./SourceCodeViewer";

export function Stacktrace({ payload }: { payload: Record<string, unknown> }) {
  const frames = readStackFrames(payload);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = frames.find((frame) => frame.id === selectedId) ?? frames[0];

  if (!selected) {
    return (
      <div className="px-5 py-10 text-center text-[11px] text-tertiary">
        No stack frames were captured for this event.
      </div>
    );
  }

  return (
    <>
      <div
        className="flex gap-1.5 overflow-x-auto border-b border-hairline px-3 py-2.5"
        role="tablist"
        aria-label="Stack frames"
      >
        {frames.map((frame) => (
          <button
            key={frame.id}
            type="button"
            role="tab"
            aria-selected={frame.id === selected.id}
            onClick={() => setSelectedId(frame.id)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-[7px] border border-transparent px-2 font-mono text-[9px] text-tertiary transition-colors hover:bg-overlay hover:text-muted",
              frame.id === selected.id && "border-hairline bg-surface-1 text-primary-hover",
            )}
          >
            {frame.functionName} · {frame.file}:{frame.line ?? "—"}
          </button>
        ))}
      </div>

      <div className="flex min-h-9.5 items-center gap-2 bg-[#111216] px-3 py-2 text-[#a4a6ae]">
        <FileCode2 className="size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-[8px] font-[680] uppercase tracking-[0.08em] text-[#737680]">
            {selected.resolved ? "Resolved location" : "Reported location"}
          </div>
          <div className="truncate font-mono text-[10px] text-[#e6e7eb]" title={selected.file}>
            {selected.file}
          </div>
        </div>
        <span className="shrink-0 font-mono text-[9px]">
          Line {selected.line ?? "—"} · Column {selected.column ?? "—"}
        </span>
      </div>

      <SourceCodeViewer frame={selected} />

      <div className="border-t border-white/7 bg-[#111216] px-3 py-2 font-mono text-[9px] leading-5 text-[#737680]">
        {selected.generated ? (
          <>
            Generated: {selected.generated.file}:{selected.generated.line ?? "—"}:
            {selected.generated.column ?? "—"}
          </>
        ) : (
          <>Generated location unavailable — this frame was not source-map resolved.</>
        )}
      </div>
    </>
  );
}

export function SymbolicationBadge({ payload }: { payload: Record<string, unknown> }) {
  const status = readSymbolicationStatus(payload);
  const config = {
    full: { dot: "bg-success", label: "Symbolicated" },
    partial: { dot: "bg-warning", label: "Partial source map" },
    none: { dot: "bg-subtle", label: "No source map" },
    unavailable: { dot: "bg-danger", label: "Source map unavailable" },
  } satisfies Record<SymbolicatedStatus, { dot: string; label: string }>;
  const entry = status ? config[status] : { dot: "bg-subtle", label: "Raw stack" };

  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-hairline bg-overlay px-2 text-[9px] font-[650] whitespace-nowrap text-muted">
      <span className={cn("size-1.5 rounded-full", entry.dot)} />
      {entry.label}
    </span>
  );
}
