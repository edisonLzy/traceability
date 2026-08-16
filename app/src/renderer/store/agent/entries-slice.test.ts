import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AppAssistantBlockMessage } from "@shared/agent-message";
import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createEntriesSlice, EntryStatus, type EntriesSlice } from "./entries-slice";

function createEntriesStore() {
  return createStore<EntriesSlice>()((...args) => createEntriesSlice(...args));
}

const userMessage = {
  role: "user",
  content: "Investigate this issue",
  timestamp: 1,
  kind: "prompt",
  jsonContent: { type: "doc" },
} as AgentMessage;

const assistantMessage = {
  role: "assistant",
  content: [{ type: "text", text: "I found the failure." }],
  timestamp: 2,
  stopReason: "stop",
} as AssistantMessage;

describe("agent entries slice", () => {
  it("keeps a linear per-session entry chain and isolates sessions", () => {
    const store = createEntriesStore();
    const firstId = store.getState().appendMessageEntry("session-a", userMessage);
    const secondId = store.getState().appendMessageEntry("session-a", assistantMessage);
    const thirdId = store.getState().appendMessageEntry("session-b", userMessage);

    const sessionA = store.getState().getEntryState("session-a").entries;
    const sessionB = store.getState().getEntryState("session-b").entries;

    expect(sessionA.map((entry) => entry.id)).toEqual([firstId, secondId]);
    expect(sessionA[0]?.parentId).toBeNull();
    expect(sessionA[1]?.parentId).toBe(firstId);
    expect(sessionB).toHaveLength(1);
    expect(sessionB[0]?.id).toBe(thirdId);
    expect(sessionB[0]?.parentId).toBeNull();
  });

  it("updates only the active streaming entry and tracks persistence state", () => {
    const store = createEntriesStore();
    const entryId = store.getState().appendMessageEntry("session-a", assistantMessage);
    store.getState().setStreamingEntryId("session-a", entryId);
    store.getState().updateMessageEntry("session-a", entryId, {
      ...assistantMessage,
      content: [{ type: "text", text: "Streaming update." }],
    });
    store.getState().setStreamingEntryCompletedAt("session-a", 3);
    store.getState().setEntryStatus("session-a", [entryId], EntryStatus.Synced);

    const entry = store.getState().getEntryState("session-a").entries[0];
    expect(entry?.status).toBe(EntryStatus.Synced);
    expect(entry?.type).toBe("message");
    if (entry?.type === "message") {
      expect(entry.completedAt).toBe(3);
      expect((entry.data as AssistantMessage).content).toEqual([
        { type: "text", text: "Streaming update." },
      ]);
    }
  });

  it("deduplicates durable assistant blocks by tool call id", () => {
    const store = createEntriesStore();
    const message: AppAssistantBlockMessage = {
      role: "assistantBlock",
      block: { type: "issues.list", props: { status: "unresolved" } },
      timestamp: 3,
      toolCallId: "render-1",
      toolName: "render_ui",
    };

    const firstId = store.getState().appendAssistantBlockEntry("session-a", message);
    const secondId = store.getState().appendAssistantBlockEntry("session-a", message);

    expect(secondId).toBe(firstId);
    expect(store.getState().getEntryState("session-a").entries).toHaveLength(1);
  });
});
