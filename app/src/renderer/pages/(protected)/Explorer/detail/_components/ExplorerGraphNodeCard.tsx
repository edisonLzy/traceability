import { cn } from "@renderer/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ExplorerFlowNode, ExplorerNodeData } from "../../types";

export function ExplorerGraphNodeCard({ data, type, selected }: NodeProps<ExplorerFlowNode>) {
  const title = getNodeTitle(data);
  const description = getNodeDescription(data);
  return (
    <div className={cn("explorer-node", selected && "selected")} data-node-type={type}>
      <span className="explorer-node__accent" />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="explorer-node__icon grid size-7 shrink-0 place-items-center rounded-[8px] border text-[12px] font-[720]">
            {nodeIcon(type)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-[680] text-ink" title={title}>
            {title}
          </span>
          <span className="rounded-full border border-hairline bg-overlay px-1.5 py-0.5 text-[8px] font-[700] uppercase tracking-[0.08em] text-tertiary">
            {type}
          </span>
        </div>
        <div
          className="explorer-node__description mt-2 min-h-[54px] rounded-[9px] px-2.5 py-2 text-[9px] leading-[1.5]"
          title={description}
        >
          <p className="line-clamp-3">{description}</p>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[9px] text-tertiary">
          <span className="explorer-node__status size-1.5 rounded-full" />
          <span className="truncate">{getNodeMeta(data)}</span>
        </div>
      </div>
      <Handle className="explorer-node__handle" position={Position.Left} type="target" />
      <Handle className="explorer-node__handle" position={Position.Right} type="source" />
    </div>
  );
}

export function getNodeTitle(data: ExplorerNodeData) {
  switch (data.kind) {
    case "question":
      return data.prompt;
    case "finding":
      return data.summary;
    case "issue":
      return `Issue ${data.issueId.slice(0, 8)}`;
    case "event":
      return `Event ${data.eventId.slice(0, 8)}`;
    case "replay":
      return `Replay ${data.replayId.slice(0, 8)}`;
    case "code":
      return data.path;
    case "document":
      return data.title;
  }
}

export function getNodeDescription(data: ExplorerNodeData) {
  switch (data.kind) {
    case "question":
      return data.intent || data.prompt;
    case "finding":
      return data.summary;
    case "issue":
      return `Traceability issue: ${data.issueId}`;
    case "event":
      return `Production event: ${data.eventId}`;
    case "replay":
      return `Session replay: ${data.replayId}`;
    case "code":
      return data.snippet || `${data.path}${data.startLine ? `:${data.startLine}` : ""}`;
    case "document":
      return data.excerpt || data.path || data.title;
  }
}

function getNodeMeta(data: ExplorerNodeData) {
  if (data.kind === "finding" && data.confidence !== undefined)
    return `${Math.round(data.confidence * 100)}% confidence`;
  if (data.kind === "code" && data.language) return data.language;
  if (data.kind === "finding" && data.status) return data.status;
  return "Ready";
}

export function nodeIcon(type: ExplorerFlowNode["type"]) {
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
