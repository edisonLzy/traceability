import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AppAssistantBlockMessage } from "@shared/agent-message";
import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand/vanilla";

import type { AgentMessage, Entry, TokenUsage } from "./types";

export type SessionStatus = "idle" | "running" | "completed" | "failed";

export type ToolExecutionStatus = "running" | "done" | "error";

export interface ToolExecutionState {
  toolCallId: string;
  toolName: string;
  status: ToolExecutionStatus;
  args: unknown;
  details?: unknown;
  output: string;
}

export enum EntryStatus {
  Local,
  Syncing,
  Synced,
  Failed,
}

export interface MessageEntry extends Omit<Entry, "data" | "type" | "tokenUsage"> {
  type: "message";
  data: AgentMessage;
  status: EntryStatus;
  completedAt?: number;
  tokenUsage?: TokenUsage | null;
}

export interface ModelChangeEntry extends Omit<Entry, "data" | "type"> {
  type: "model_change";
  data: Record<string, unknown>;
  status: EntryStatus;
}

export type SessionEntry = MessageEntry | ModelChangeEntry;

export interface EntryState {
  entries: SessionEntry[];
  toolStates: Map<string, ToolExecutionState>;
  status: SessionStatus;
}

export interface EntriesSlice {
  entryStates: Map<string, EntryState>;
  streamingEntryIds: Map<string, string>;

  getEntryState: (sessionId: string) => EntryState;
  appendMessageEntry: (sessionId: string, message: AgentMessage) => string;
  appendAssistantBlockEntry: (sessionId: string, message: AppAssistantBlockMessage) => string;
  updateMessageEntry: (sessionId: string, entryId: string, message: AssistantMessage) => void;
  setMessageEntryTokenUsage: (sessionId: string, entryId: string, tokenUsage: TokenUsage) => void;
  setEntryStatus: (sessionId: string, entryIds: string[], status: EntryStatus) => void;
  setSessionEntries: (sessionId: string, entries: SessionEntry[]) => void;
  setSessionStatus: (sessionId: string, status: SessionStatus) => void;
  setToolState: (sessionId: string, toolCallId: string, state: ToolExecutionState) => void;
  setStreamingEntryCompletedAt: (sessionId: string, completedAt: number) => void;
  setStreamingEntryId: (sessionId: string, entryId: string | undefined) => void;
  removeEntryState: (sessionId: string) => void;
}

export const EMPTY_ENTRY_STATE: EntryState = {
  entries: [],
  toolStates: new Map(),
  status: "idle",
};

function getOrCreateEntryState(
  entryStates: Map<string, EntryState>,
  sessionId: string,
): EntryState {
  return entryStates.get(sessionId) ?? EMPTY_ENTRY_STATE;
}

export const createEntriesSlice: StateCreator<EntriesSlice, [], [], EntriesSlice> = (set, get) => ({
  entryStates: new Map(),
  streamingEntryIds: new Map(),

  getEntryState: (sessionId) => get().entryStates.get(sessionId) ?? EMPTY_ENTRY_STATE,

  appendMessageEntry: (sessionId, message) => {
    const entryId = uuidv4();
    const state = get().getEntryState(sessionId);
    const parentId = state.entries.at(-1)?.id ?? null;
    const entry: MessageEntry = {
      id: entryId,
      sessionId,
      parentId,
      type: "message",
      timestamp: Date.now(),
      data: message,
      status: EntryStatus.Local,
    };

    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      entryStates.set(sessionId, { ...current, entries: [...current.entries, entry] });
      return { entryStates };
    });

    return entryId;
  },

  appendAssistantBlockEntry: (sessionId, message) => {
    const existing = get()
      .getEntryState(sessionId)
      .entries.find(
        (entry) =>
          entry.type === "message" &&
          entry.data.role === "assistantBlock" &&
          entry.data.toolCallId === message.toolCallId,
      );
    if (existing) return existing.id;
    return get().appendMessageEntry(sessionId, message);
  },

  updateMessageEntry: (sessionId, entryId, message) => {
    const current = get().getEntryState(sessionId);
    const entryIndex = current.entries.findIndex((entry) => entry.id === entryId);
    const existing = current.entries[entryIndex];
    if (!existing || existing.type !== "message") return;

    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const state = getOrCreateEntryState(entryStates, sessionId);
      const entries = [...state.entries];
      entries[entryIndex] = { ...existing, data: message };
      entryStates.set(sessionId, { ...state, entries });
      return { entryStates };
    });
  },

  setMessageEntryTokenUsage: (sessionId, entryId, tokenUsage) => {
    const current = get().getEntryState(sessionId);
    const entryIndex = current.entries.findIndex((entry) => entry.id === entryId);
    const existing = current.entries[entryIndex];
    if (!existing || existing.type !== "message") return;

    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const state = getOrCreateEntryState(entryStates, sessionId);
      const entries = [...state.entries];
      entries[entryIndex] = { ...existing, tokenUsage };
      entryStates.set(sessionId, { ...state, entries });
      return { entryStates };
    });
  },

  setEntryStatus: (sessionId, entryIds, status) => {
    if (entryIds.length === 0) return;
    const ids = new Set(entryIds);

    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const state = getOrCreateEntryState(entryStates, sessionId);
      entryStates.set(sessionId, {
        ...state,
        entries: state.entries.map((entry) => (ids.has(entry.id) ? { ...entry, status } : entry)),
      });
      return { entryStates };
    });
  },

  setSessionEntries: (sessionId, entries) => {
    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      entryStates.set(sessionId, { ...current, entries });
      return { entryStates };
    });
  },

  setSessionStatus: (sessionId, status) => {
    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      entryStates.set(sessionId, { ...current, status });
      return { entryStates };
    });
  },

  setToolState: (sessionId, toolCallId, state) => {
    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      const toolStates = new Map(current.toolStates);
      toolStates.set(toolCallId, state);
      entryStates.set(sessionId, { ...current, toolStates });
      return { entryStates };
    });
  },

  setStreamingEntryCompletedAt: (sessionId, completedAt) => {
    const entryId = get().streamingEntryIds.get(sessionId);
    if (!entryId) return;

    const current = get().getEntryState(sessionId);
    const entryIndex = current.entries.findIndex((entry) => entry.id === entryId);
    const existing = current.entries[entryIndex];
    if (!existing || existing.type !== "message") return;

    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const state = getOrCreateEntryState(entryStates, sessionId);
      const entries = [...state.entries];
      entries[entryIndex] = { ...existing, completedAt };
      entryStates.set(sessionId, { ...state, entries });
      return { entryStates };
    });
  },

  setStreamingEntryId: (sessionId, entryId) => {
    set((previous) => {
      const streamingEntryIds = new Map(previous.streamingEntryIds);
      if (entryId) streamingEntryIds.set(sessionId, entryId);
      else streamingEntryIds.delete(sessionId);
      return { streamingEntryIds };
    });
  },

  removeEntryState: (sessionId) => {
    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const streamingEntryIds = new Map(previous.streamingEntryIds);
      entryStates.delete(sessionId);
      streamingEntryIds.delete(sessionId);
      return { entryStates, streamingEntryIds };
    });
  },
});
