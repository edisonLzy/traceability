import { cn } from "@renderer/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ExplorerFlowNode, ExplorerNodeData } from "../../types";

export function ExplorerGraphNodeCard({ data, type, selected }: NodeProps<ExplorerFlowNode>) {
  const title = getNodeTitle(data);
  const description = getNodeDescription(data);
  const meta = getNodeMeta(data);
  const isYoutube = data?.kind === "youtube";
  const youtubeVideoId = isYoutube ? data.videoId || extractYoutubeId(data.url) : null;
  const thumbnailUrl = isYoutube
    ? data.thumbnailUrl ||
      (youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : null)
    : null;

  return (
    <div className={cn("explorer-node", selected && "selected")} data-node-type={type}>
      <span className="explorer-node__accent" />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="explorer-node__icon grid size-7 shrink-0 place-items-center rounded-[4px] border-1.5 border-ink bg-muted text-[13px] font-bold font-mono">
            {nodeIcon(type)}
          </span>
          <span
            className="min-w-0 flex-1 truncate font-heading text-[12px] font-bold text-ink"
            title={title}
          >
            {title}
          </span>
          <span className="explorer-node__badge shrink-0 rounded-[3px] border border-ink px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.08em]">
            {type}
          </span>
        </div>

        {isYoutube && thumbnailUrl ? (
          <div className="mt-2.5 overflow-hidden rounded-[4px] border border-ink/30 bg-black relative">
            <img
              alt={title}
              className="h-20 w-full object-cover opacity-85 hover:opacity-100 transition-opacity"
              src={thumbnailUrl}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-1.5 pointer-events-none">
              <span className="text-[8.5px] font-mono text-white bg-black/70 px-1 py-0.5 rounded border border-white/20">
                {data.duration ? formatDuration(data.duration) : "Video"}
              </span>
              <span className="size-5 rounded-full bg-signal-red text-white grid place-items-center text-[8px] font-bold border border-white shadow">
                ▶
              </span>
            </div>
          </div>
        ) : (
          <div
            className="explorer-node__description mt-2.5 min-h-[52px] rounded-[4px] border border-ink/30 bg-muted/40 p-2 text-[10px] leading-[1.45] font-sans"
            title={description}
          >
            <p className="line-clamp-3 font-medium text-ink">{description}</p>
          </div>
        )}

        {isYoutube && data.bookmarks && data.bookmarks.length > 0 ? (
          <div className="mt-2 flex items-center gap-1 overflow-hidden font-mono text-[8.5px]">
            {data.bookmarks.slice(0, 2).map((bm) => (
              <span
                key={bm.id}
                className="shrink-0 rounded border border-signal-red/50 bg-signal-red/10 px-1 py-0.5 text-signal-red font-semibold truncate max-w-[90px]"
                title={`${formatDuration(bm.time)} - ${bm.label}`}
              >
                📍 {formatDuration(bm.time)}
              </span>
            ))}
            {data.bookmarks.length > 2 ? (
              <span className="shrink-0 rounded border border-ink/20 bg-muted/30 px-1 py-0.5 text-[8px] text-muted-foreground">
                +{data.bookmarks.length - 2}
              </span>
            ) : null}
          </div>
        ) : null}

        {data?.kind === "browser" && data.anchors && data.anchors.length > 0 ? (
          <div className="mt-2 flex items-center gap-1 overflow-hidden font-mono text-[8.5px]">
            {data.anchors.slice(0, 2).map((anchor) => (
              <span
                key={anchor.id}
                className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1 py-0.5 text-ink font-semibold truncate max-w-[100px]"
                title={anchor.label}
              >
                ⚓ {anchor.label}
              </span>
            ))}
            {data.anchors.length > 2 ? (
              <span className="shrink-0 rounded border border-ink/20 bg-muted/30 px-1 py-0.5 text-[8px] text-muted-foreground">
                +{data.anchors.length - 2}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5 flex items-center justify-between border-t border-ink/15 pt-1.5 font-mono text-[9px] text-muted-foreground">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="explorer-node__status size-2 rounded-full border border-ink/40" />
            <span className="truncate font-semibold">{meta}</span>
          </div>
          <span className="shrink-0 text-[8.5px] uppercase tracking-wider text-tertiary">
            LR-Tree
          </span>
        </div>
      </div>
      <Handle
        className="explorer-node__handle explorer-node__handle--target"
        position={Position.Left}
        type="target"
      />
      <Handle
        className="explorer-node__handle explorer-node__handle--source"
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

export function getNodeTitle(data?: ExplorerNodeData) {
  if (!data) return "Node";
  switch (data.kind) {
    case "question":
      return data.prompt ?? "Question";
    case "finding":
      return data.summary ?? "Finding";
    case "issue":
      return `Issue ${data.issueId ? data.issueId.slice(0, 8) : ""}`;
    case "event":
      return `Event ${data.eventId ? data.eventId.slice(0, 8) : ""}`;
    case "replay":
      return `Replay ${data.replayId ? data.replayId.slice(0, 8) : ""}`;
    case "code":
      return data.symbolName ? `${data.symbolName}` : (data.path ?? "Code");
    case "document":
      return data.title ?? "Document";
    case "youtube":
      return data.title ?? (data.videoId ? `YouTube (${data.videoId})` : "YouTube Video");
    case "browser":
      return (
        data.source?.title ||
        data.preview?.title ||
        (data.source?.url ? getHostname(data.source.url) : "Browser Page")
      );
    default:
      return "Node";
  }
}

export function getNodeDescription(data?: ExplorerNodeData) {
  if (!data) return "";
  switch (data.kind) {
    case "question":
      return data.intent || data.prompt || "Question investigation";
    case "finding":
      return data.summary || "Investigation finding";
    case "issue":
      return `Traceability issue: ${data.issueId ?? ""}`;
    case "event":
      return `Production event: ${data.eventId ?? ""}`;
    case "replay":
      return `Session replay: ${data.replayId ?? ""}`;
    case "code":
      return data.snippet || `${data.path ?? ""}${data.startLine ? `:${data.startLine}` : ""}`;
    case "document":
      return data.excerpt || data.path || data.title || "Document reference";
    case "youtube":
      return data.transcriptExcerpt || data.url || "YouTube video recording";
    case "browser":
      return data.preview?.excerpt || data.source?.url || "Browser document reference";
    default:
      return "";
  }
}

export function getNodeMeta(data?: ExplorerNodeData) {
  if (!data) return "Ready";
  if (data.kind === "finding" && data.confidence !== undefined)
    return `${Math.round(data.confidence * 100)}% confidence`;
  if (data.kind === "code") {
    if (data.symbolType) return data.symbolType;
    if (data.language) return data.language;
  }
  if (data.kind === "finding" && data.status) return data.status;
  if (data.kind === "youtube") {
    if (data.duration) return formatDuration(data.duration);
    return "Video";
  }
  if (data.kind === "browser") {
    const provider = data.source?.provider || "web";
    const anchorCount = data.anchors?.length ?? 0;
    return anchorCount > 0
      ? `${provider} · ${anchorCount} anchor${anchorCount > 1 ? "s" : ""}`
      : provider;
  }
  return "Ready";
}

export function nodeIcon(type?: ExplorerFlowNode["type"]) {
  return type === "question"
    ? "?"
    : type === "finding"
      ? "✦"
      : type === "issue"
        ? "!"
        : type === "event"
          ? "⌁"
          : type === "code"
            ? "{}"
            : type === "document"
              ? "▤"
              : type === "youtube"
                ? "▶"
                : type === "browser"
                  ? "🌐"
                  : "◌";
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function extractYoutubeId(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  const id = match ? match[2] : undefined;
  return id && id.length === 11 ? id : null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
