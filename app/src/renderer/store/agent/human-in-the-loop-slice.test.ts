import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createAgentTodoSlice } from "./agent-todo-slice";
import { createEntriesSlice } from "./entries-slice";
import { createHumanInTheLoopSlice } from "./human-in-the-loop-slice";
import type { AgentStoreState } from "./index";
import { createPendingMessagesSlice } from "./pending-messages-slice";
import { createSessionsSlice } from "./sessions-slice";

function createTestStore() {
  return createStore<AgentStoreState>()((...args) => ({
    ...createEntriesSlice(...args),
    ...createAgentTodoSlice(...args),
    ...createHumanInTheLoopSlice(...args),
    ...createPendingMessagesSlice(...args),
    ...createSessionsSlice(...args),
  }));
}

describe("human-in-the-loop slice", () => {
  it("resolves one session-scoped question without affecting another", () => {
    const store = createTestStore();
    const request = {
      requestId: "question-a",
      createdAt: 1,
      kind: "ask_user_question" as const,
      questions: [
        {
          header: "Scope",
          question: "Continue?",
          options: [{ label: "Yes", description: "Continue" }],
        },
      ],
    };
    store.getState().enqueueHumanInTheLoopRequest("a", request);
    store.getState().enqueueHumanInTheLoopRequest("b", { ...request, requestId: "question-b" });

    store.getState().resolveHumanInTheLoopRequest("a", "question-a", {
      answers: [{ question: "Continue?", selectedOptions: ["Yes"] }],
    });

    expect(store.getState().getHumanInTheLoopState("a").requests).toEqual([]);
    expect(store.getState().getHumanInTheLoopState("a").lastResolvedRequest?.requestId).toBe(
      "question-a",
    );
    expect(store.getState().getHumanInTheLoopState("b").requests).toHaveLength(1);
  });
});
