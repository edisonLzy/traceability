import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createAgentTodoSlice, type AgentTodoSlice } from "./agent-todo-slice";

function createTodoStore() {
  return createStore<AgentTodoSlice>()((...args) => createAgentTodoSlice(...args));
}

describe("agent todo slice", () => {
  it("replaces snapshots and isolates sessions", () => {
    const store = createTodoStore();
    store.getState().setAgentTodo("session-a", {
      todos: [{ id: "inspect", title: "Inspect issue", status: "in_progress" }],
    });
    store.getState().setAgentTodo("session-b", {
      todos: [{ id: "fix", title: "Prepare fix", status: "pending" }],
    });

    store.getState().setAgentTodo("session-a", {
      todos: [{ id: "verify", title: "Verify fix", status: "completed" }],
    });

    expect(store.getState().getAgentTodo("session-a").todos).toEqual([
      { id: "verify", title: "Verify fix", status: "completed" },
    ]);
    expect(store.getState().getAgentTodo("session-b").todos).toEqual([
      { id: "fix", title: "Prepare fix", status: "pending" },
    ]);
  });

  it("supports explicit clearing and removal", () => {
    const store = createTodoStore();
    store.getState().setAgentTodo("session-a", {
      todos: [{ id: "inspect", title: "Inspect issue", status: "completed" }],
    });

    store.getState().clearAgentTodo("session-a");
    expect(store.getState().getAgentTodo("session-a").todos).toEqual([]);

    store.getState().removeAgentTodo("session-a");
    expect(store.getState().agentTodos.has("session-a")).toBe(false);
  });
});
