import type { ToolResultMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@renderer/store/agent";
import {
  AGENT_TODO_TOOL_NAME,
  parseAgentTodoDetails,
  type AgentTodoSnapshot,
} from "@shared/agent-todo";

import { isMessageEntry, isUserMessage } from "./messages/types";

/**
 * Returns the latest Todo snapshot belonging to the current top-level task.
 * Older snapshots remain in the transcript but must not leak into a new task.
 */
export function findLatestAgentTodoSnapshot(entries: SessionEntry[]): AgentTodoSnapshot | null {
  for (const entry of [...entries].reverse()) {
    if (!isMessageEntry(entry)) continue;

    if (isUserMessage(entry.data)) {
      if (entry.data.kind === "prompt") break;
      continue;
    }

    if (!isAgentTodoToolResult(entry.data)) continue;
    const snapshot = parseAgentTodoDetails(entry.data.details);
    if (snapshot) return snapshot;
  }

  return null;
}

function isAgentTodoToolResult(message: SessionEntry["data"]): message is ToolResultMessage {
  return message.role === "toolResult" && message.toolName === AGENT_TODO_TOOL_NAME;
}
