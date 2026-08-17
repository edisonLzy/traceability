import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@renderer/store/agent";
import { describe, expect, it } from "vitest";

import { findLatestAgentTodoSnapshot } from "./agentTodoProjection";

function messageEntry(id: string, data: AgentMessage): SessionEntry {
  return {
    id,
    sessionId: "session-a",
    parentId: null,
    type: "message",
    timestamp: Number(id),
    data,
    status: 2,
  };
}

function todoResult(id: string, todos: ToolResultMessage["details"]["todos"]): SessionEntry {
  return messageEntry(id, {
    role: "toolResult",
    toolCallId: `call-${id}`,
    toolName: "agent_todo",
    content: [{ type: "text", text: "Todo list updated" }],
    details: { todos },
    isError: false,
    timestamp: Number(id),
  } as ToolResultMessage);
}

describe("findLatestAgentTodoSnapshot", () => {
  it("returns the latest snapshot after the latest top-level prompt", () => {
    const entries = [
      messageEntry("1", {
        role: "user",
        content: "old task",
        timestamp: 1,
        kind: "prompt",
        jsonContent: { type: "doc" },
      } as AgentMessage),
      todoResult("2", [{ id: "old", title: "Old task", status: "completed" }]),
      messageEntry("3", {
        role: "user",
        content: "new task",
        timestamp: 3,
        kind: "prompt",
        jsonContent: { type: "doc" },
      } as AgentMessage),
      todoResult("4", [{ id: "new", title: "New task", status: "in_progress" }]),
    ];

    expect(findLatestAgentTodoSnapshot(entries)).toEqual({
      todos: [{ id: "new", title: "New task", status: "in_progress" }],
    });
  });

  it("preserves an explicit empty snapshot", () => {
    const entries = [
      messageEntry("1", {
        role: "user",
        content: "task",
        timestamp: 1,
        kind: "prompt",
        jsonContent: { type: "doc" },
      } as AgentMessage),
      todoResult("2", []),
    ];

    expect(findLatestAgentTodoSnapshot(entries)).toEqual({ todos: [] });
  });
});
