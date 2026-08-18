import type { AgentTodoItem, AgentTodoSnapshot } from "@shared/agent-todo";
import type { StateCreator } from "zustand/vanilla";

export interface AgentTodoViewState {
  todos: AgentTodoItem[];
  sourceToolCallId?: string;
  updatedAt?: number;
}

export interface AgentTodoSlice {
  agentTodos: Map<string, AgentTodoViewState>;

  getAgentTodo: (sessionId: string) => AgentTodoViewState;
  setAgentTodo: (
    sessionId: string,
    snapshot: AgentTodoSnapshot,
    metadata?: { sourceToolCallId?: string },
  ) => void;
  hydrateAgentTodo: (sessionId: string, snapshot: AgentTodoSnapshot | null) => void;
  clearAgentTodo: (sessionId: string) => void;
  removeAgentTodo: (sessionId: string) => void;
}

export const EMPTY_AGENT_TODO: AgentTodoViewState = {
  todos: [],
};

export const createAgentTodoSlice: StateCreator<AgentTodoSlice, [], [], AgentTodoSlice> = (
  set,
  get,
) => ({
  agentTodos: new Map(),

  getAgentTodo: (sessionId) => get().agentTodos.get(sessionId) ?? EMPTY_AGENT_TODO,

  setAgentTodo: (sessionId, snapshot, metadata) => {
    set((previous) => {
      const agentTodos = new Map(previous.agentTodos);
      agentTodos.set(sessionId, {
        todos: snapshot.todos.map((todo) => ({ ...todo })),
        sourceToolCallId: metadata?.sourceToolCallId,
        updatedAt: Date.now(),
      });
      return { agentTodos };
    });
  },

  hydrateAgentTodo: (sessionId, snapshot) => {
    if (!snapshot) {
      get().clearAgentTodo(sessionId);
      return;
    }
    get().setAgentTodo(sessionId, snapshot);
  },

  clearAgentTodo: (sessionId) => {
    set((previous) => {
      const agentTodos = new Map(previous.agentTodos);
      agentTodos.set(sessionId, { todos: [], updatedAt: Date.now() });
      return { agentTodos };
    });
  },

  removeAgentTodo: (sessionId) => {
    set((previous) => {
      if (!previous.agentTodos.has(sessionId)) return previous;
      const agentTodos = new Map(previous.agentTodos);
      agentTodos.delete(sessionId);
      return { agentTodos };
    });
  },
});
