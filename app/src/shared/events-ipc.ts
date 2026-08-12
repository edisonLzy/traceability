import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type { AskUserQuestionRequestedEvent } from "./ask-user-question-ipc";
import type { AuthIPC } from "./auth-ipc";
import type { AgentModelsIPC } from "./models-ipc";
import type { AgentSessionIPC } from "./session-ipc";
import type { SessionPersistenceIPC } from "./session-persistence-ipc";
import type { AgentSkillsIPC } from "./skills-ipc";
import type { NativeThemeUpdatedEvent, ThemeIPC } from "./theme-ipc";
import type { WindowIPC, WindowState } from "./window-ipc";

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
  "native_theme_updated",
  "window_state_updated",
] as const;

/**
 * Agent-runtime events, each tagged with the sessionId so the renderer can
 * route multi-session events to the correct session's state store.
 */
export type AgentExposeEvents = {
  [K in AgentRuntimeEvent as K["type"]]: SessionTagged<K>;
};

/** Full main -> renderer surface: agent-runtime events plus app-level events
    (e.g. native theme changes) that are not tied to any session. */
export type AllowedMainExposeEvents = AgentExposeEvents & {
  native_theme_updated: NativeThemeUpdatedEvent;
  window_state_updated: WindowState;
};

// render -> main

export type AgentRuntimeIPC = AgentModelsIPC &
  AgentSessionIPC &
  AgentSkillsIPC &
  SessionPersistenceIPC &
  AuthIPC &
  ThemeIPC &
  WindowIPC;

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
  "setThemeSource",
  "getThemeSource",
  "closeWindow",
  "getWindowState",
  "minimizeWindow",
  "toggleFullScreenWindow",
  "toggleMaximizeWindow",
];

export type AllowedRenderInvokeEvents = (typeof ALLOWED_RENDER_INVOKE_EVENTS)[number];
