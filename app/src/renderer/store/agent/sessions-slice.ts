import type { AvailableModel } from "@shared/models-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { AgentStoreState } from "./index";
import type { MonitoringContext, Session } from "./types";

export interface AgentSession extends Session {
  model: AvailableModel | null;
  monitoringContext: MonitoringContext | null;
}

export interface SessionsSlice {
  activeSessionId: string | null;
  sessions: AgentSession[];

  appendSession: (session: Session) => void;
  getSession: (sessionId: string) => AgentSession | undefined;
  removeSession: (sessionId: string) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setMonitoringContext: (sessionId: string, context: MonitoringContext | null) => void;
  setModel: (sessionId: string, model: AvailableModel | null) => void;
  setSessionName: (sessionId: string, name: string) => void;
  setSessions: (sessions: Session[]) => void;
}

function createAgentSession(session: Session, current?: AgentSession): AgentSession {
  return {
    ...session,
    model: current?.model ?? null,
    monitoringContext: current?.monitoringContext ?? null,
  };
}

export const createSessionsSlice: StateCreator<AgentStoreState, [], [], SessionsSlice> = (
  set,
  get,
) => ({
  activeSessionId: null,
  sessions: [],

  appendSession: (session) => {
    set((previous) => {
      const existingIndex = previous.sessions.findIndex((candidate) => candidate.id === session.id);
      if (existingIndex < 0)
        return { sessions: [...previous.sessions, createAgentSession(session)] };

      const sessions = [...previous.sessions];
      sessions[existingIndex] = createAgentSession(session, sessions[existingIndex]);
      return { sessions };
    });
  },

  getSession: (sessionId) => get().sessions.find((session) => session.id === sessionId),

  removeSession: (sessionId) => {
    set((previous) => {
      const entryStates = new Map(previous.entryStates);
      const streamingEntryIds = new Map(previous.streamingEntryIds);
      const humanInTheLoopStates = new Map(previous.humanInTheLoopStates);
      const pendingMessages = new Map(previous.pendingMessages);
      const agentTodos = new Map(previous.agentTodos);
      entryStates.delete(sessionId);
      streamingEntryIds.delete(sessionId);
      humanInTheLoopStates.delete(sessionId);
      pendingMessages.delete(sessionId);
      agentTodos.delete(sessionId);
      return {
        activeSessionId: previous.activeSessionId === sessionId ? null : previous.activeSessionId,
        sessions: previous.sessions.filter((session) => session.id !== sessionId),
        entryStates,
        streamingEntryIds,
        humanInTheLoopStates,
        pendingMessages,
        agentTodos,
      };
    });
  },

  setActiveSessionId: (sessionId) => set({ activeSessionId: sessionId }),

  setMonitoringContext: (sessionId, monitoringContext) => {
    set((previous) => ({
      sessions: previous.sessions.map((session) =>
        session.id === sessionId ? { ...session, monitoringContext } : session,
      ),
    }));
  },

  setModel: (sessionId, model) => {
    set((previous) => ({
      sessions: previous.sessions.map((session) =>
        session.id === sessionId ? { ...session, model } : session,
      ),
    }));
  },

  setSessionName: (sessionId, name) => {
    set((previous) => ({
      sessions: previous.sessions.map((session) =>
        session.id === sessionId ? { ...session, name } : session,
      ),
    }));
  },

  setSessions: (sessions) => {
    set((previous) => {
      const current = new Map(previous.sessions.map((session) => [session.id, session]));
      const nextSessions = sessions.map((session) =>
        createAgentSession(session, current.get(session.id)),
      );
      const activeSessionId = nextSessions.some(
        (session) => session.id === previous.activeSessionId,
      )
        ? previous.activeSessionId
        : null;
      return { activeSessionId, sessions: nextSessions };
    });
  },
});
