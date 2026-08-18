import "@shared/agent-message";
import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createAgentTodoSlice } from "./agent-todo-slice";
import { createEntriesSlice } from "./entries-slice";
import { createHumanInTheLoopSlice } from "./human-in-the-loop-slice";
import type { AgentStoreState } from "./index";
import { createPendingMessagesSlice } from "./pending-messages-slice";
import { createSessionsSlice } from "./sessions-slice";

function createMessage(timestamp: number): AppUserMessage {
  return {
    role: "user",
    content: "keep investigating",
    timestamp,
    kind: "follow-up",
    jsonContent: { type: "doc", content: [] },
  };
}

function createTestStore() {
  return createStore<AgentStoreState>()((...args) => ({
    ...createEntriesSlice(...args),
    ...createAgentTodoSlice(...args),
    ...createHumanInTheLoopSlice(...args),
    ...createPendingMessagesSlice(...args),
    ...createSessionsSlice(...args),
  }));
}

describe("pending messages slice", () => {
  it("isolates queues and removes only the consumed renderer message", () => {
    const store = createTestStore();
    store.getState().addPendingMessage("a", createMessage(1));
    store.getState().addPendingMessage("a", createMessage(2));
    store.getState().addPendingMessage("b", createMessage(1));

    store.getState().removePendingMessageByTimestamp("a", 1);

    expect(
      store
        .getState()
        .getSessionPendingMessages("a")
        .map((message) => message.timestamp),
    ).toEqual([2]);
    expect(
      store
        .getState()
        .getSessionPendingMessages("b")
        .map((message) => message.timestamp),
    ).toEqual([1]);
  });
});
