import { cn } from "@renderer/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ExplorerFlowNode, ExplorerNodeData } from "../../types";

export function ExplorerGraphNodeCard({ data, type, selected }: NodeProps<ExplorerFlowNode>) {
  const title = getNodeTitle(data);
  const description = getNodeDescription(data);
  const meta = getNodeMeta(data);

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
        <div
          className="explorer-node__description mt-2.5 min-h-[52px] rounded-[4px] border border-ink/30 bg-muted/40 p-2 text-[10px] leading-[1.45] font-sans"
          title={description}
        >
          <p className="line-clamp-3 font-medium text-ink">{description}</p>
        </div>
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
      return data.path ?? "Code";
    case "document":
      return data.title ?? "Document";
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
    default:
      return "";
  }
}

export function getNodeMeta(data?: ExplorerNodeData) {
  if (!data) return "Ready";
  if (data.kind === "finding" && data.confidence !== undefined)
    return `${Math.round(data.confidence * 100)}% confidence`;
  if (data.kind === "code" && data.language) return data.language;
  if (data.kind === "finding" && data.status) return data.status;
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
              : "◌";
}
