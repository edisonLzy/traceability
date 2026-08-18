import type { ExplorerRealtimeState } from "../_hooks/use-explorer-graph-realtime";

export function ExplorerGraphRealtimeStatus({ realtime }: { realtime: ExplorerRealtimeState }) {
  const { lastError, status } = realtime;
  const connected = status === "connected";
  const label = connected ? "Connected" : status === "reconnecting" ? "Reconnecting" : "Connecting";

  return (
    <div
      className={
        connected
          ? "absolute top-3 right-3 z-10 rounded-full border border-success/20 bg-success/[0.08] px-2.5 py-1 text-[10px] text-success"
          : "absolute top-3 right-3 z-10 rounded-full border border-warning/25 bg-warning/[0.08] px-2.5 py-1 text-[10px] text-warning"
      }
      title={lastError ?? undefined}
    >
      <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />
      {label}
    </div>
  );
}
