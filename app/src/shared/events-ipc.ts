import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type { AskUserQuestionRequestedEvent } from "./ask-user-question-ipc";
import type { AuthIPC } from "./auth-ipc";
import type { AgentModelsIPC } from "./models-ipc";
import type { AgentSessionIPC } from "./session-ipc";
import type { SessionPersistenceIPC } from "./session-persistence-ipc";
import type { AgentSkillsIPC } from "./skills-ipc";

export type AgentSessionScope = "main" | "side-chat";
type SessionTagged<T> = T & { scope: AgentSessionScope; sessionId: string };
type AgentRuntimeEvent = AgentEvent | AskUserQuestionRequestedEvent;

// main -> renderer events. These are verified at compile-time to be a subset of the
export const ALLOWED_MAIN_EXPOSE_EVENTS = [
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "ask_user_question_requested",
] as const;

/**
 * Each agent event is tagged with the sessionId so the renderer can
 * route multi-session events to the correct session's state store.
 */
export type AllowedMainExposeEvents = {
  [K in AgentRuntimeEvent as K["type"]]: SessionTagged<K>;
};

// render -> main

export type AgentRuntimeIPC = AgentModelsIPC &
  AgentSessionIPC &
  AgentSkillsIPC &
  SessionPersistenceIPC &
  AuthIPC;

export const ALLOWED_RENDER_INVOKE_EVENTS: (keyof AgentRuntimeIPC)[] = [
  "setModel",
  "getAvailableModels",
  "getModelConfig",
  "saveModelConfig",
  "prompt",
  "clearAllQueues",
  "runOneTimeAgent",
  "abortPrompt",
  "setHistoryMessages",
  "setSessionId",
  "setSessionScope",
  "destroySession",
  "resolveAskUserQuestion",
  "listSkills",
  "setSkillEnabled",
  "createSession",
  "listSessions",
  "getSession",
  "getSessionEntries",
  "renameSession",
  "deleteSession",
  "appendSessionEntries",
  "getBranch",
  "setLeaf",
  "buildContext",
  "getAuthSession",
  "saveAuthSession",
  "clearAuthSession",
];

export type AllowedRenderInvokeEvents = (typeof ALLOWED_RENDER_INVOKE_EVENTS)[number];
