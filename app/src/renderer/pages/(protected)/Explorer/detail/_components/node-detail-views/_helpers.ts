import type { ExplorerFlowNode, ExplorerNodeData } from "../../../types";

/**
 * 共享节点显示语义。卡片和详情面板都从这里读取，确保两处展示同一份
 * 真理。新增节点类型时，switch 必须补齐对应 case（TS 编译期强制）。
 */

export function getNodeTitle(data: ExplorerNodeData): string {
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

export function getNodeDescription(data: ExplorerNodeData): string {
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

export function nodeIcon(type: ExplorerFlowNode["type"]): string {
  return type === "question"
    ? "?"
    : type === "finding"
      ? "✦"
      : type === "issue"
        ? "!"
        : type === "event"
          ? "⌁"
          : type === "replay"
            ? "R"
            : type === "code"
              ? "{}"
              : type === "document"
                ? "▤"
                : "◌";
}

export function getNodeMeta(data: ExplorerNodeData): string {
  if (data.kind === "finding" && data.confidence !== undefined) {
    return `${Math.round(data.confidence * 100)}% confidence`;
  }
  if (data.kind === "code" && data.language) return data.language;
  if (data.kind === "finding" && data.status) return data.status;
  if (data.kind === "question" && data.intent) return data.intent;
  return "Ready";
}
