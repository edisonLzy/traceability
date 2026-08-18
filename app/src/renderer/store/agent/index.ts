import { createStore } from "zustand/vanilla";

import { createAgentTodoSlice, type AgentTodoSlice } from "./agent-todo-slice";
import { createEntriesSlice, type EntriesSlice } from "./entries-slice";
import { createHumanInTheLoopSlice, type HumanInTheLoopSlice } from "./human-in-the-loop-slice";
import { createPendingMessagesSlice, type PendingMessagesSlice } from "./pending-messages-slice";
import { createSessionsSlice, type SessionsSlice } from "./sessions-slice";

export type AgentStoreState = EntriesSlice &
  AgentTodoSlice &
  HumanInTheLoopSlice &
  PendingMessagesSlice &
  SessionsSlice;

export const agentStore = createStore<AgentStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createAgentTodoSlice(...args),
  ...createHumanInTheLoopSlice(...args),
  ...createPendingMessagesSlice(...args),
  ...createSessionsSlice(...args),
}));

export type { AgentSession } from "./sessions-slice";
export { EntryStatus } from "./entries-slice";
export type { AgentTodoSlice, AgentTodoViewState } from "./agent-todo-slice";
export type {
  MessageEntry,
  SessionEntry,
  SessionStatus,
  ToolExecutionState,
  ToolExecutionStatus,
} from "./entries-slice";
export type { Entry, MonitoringContext, Session, TokenUsage } from "./types";
