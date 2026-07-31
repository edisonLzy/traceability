import type { AssistantMessage } from "@earendil-works/pi-ai";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore, EntryStatus, type SessionEntry } from "@renderer/store/agent";
import type { AskUserQuestionRequest } from "@shared/ask-user-question-ipc";
import { useRef } from "react";

import {
  isAssistantMessage,
  isFailedAssistantMessage,
  isMessageEntry,
  isUserMessage,
} from "./messages/types";
import { useSubscribeAgentEvents } from "./useSubscribeAgentEvents";

function findMissingFailureMessage(entries: SessionEntry[], messages: unknown[]) {
  return messages.filter(isFailedAssistantMessage).find((message) => {
    return !entries.some(
      (entry) =>
        isMessageEntry(entry) &&
        isAssistantMessage(entry.data) &&
        entry.data.timestamp === message.timestamp &&
        entry.data.stopReason === message.stopReason,
    );
  });
}

function updateStreamingAssistant(
  sessionId: string,
  message: AssistantMessage,
  turnStartIndex: number,
): void {
  const store = agentStore.getState();
  const streamingEntryId = store.streamingEntryIds.get(sessionId);
  if (!streamingEntryId) return;

  const entry = store
    .getEntryState(sessionId)
    .entries.find((candidate) => candidate.id === streamingEntryId);
  if (!entry || !isMessageEntry(entry) || !isAssistantMessage(entry.data)) return;

  if (
    turnStartIndex === 0 ||
    !Array.isArray(entry.data.content) ||
    !Array.isArray(message.content)
  ) {
    store.updateMessageEntry(sessionId, streamingEntryId, message);
    return;
  }

  store.updateMessageEntry(sessionId, streamingEntryId, {
    ...message,
    content: [...entry.data.content.slice(0, turnStartIndex), ...message.content],
  });
}

async function persistUnsyncedEntries(
  invoke: ReturnType<typeof useElectronIPC>["invoke"],
  sessionId: string,
): Promise<void> {
  const store = agentStore.getState();
  const entries = store
    .getEntryState(sessionId)
    .entries.filter((entry) => entry.status !== EntryStatus.Synced);
  if (entries.length === 0) return;

  const entryIds = entries.map((entry) => entry.id);
  store.setEntryStatus(sessionId, entryIds, EntryStatus.Syncing);

  try {
    await invoke(
      "appendSessionEntries",
      sessionId,
      entries.map((entry) => ({
        id: entry.id,
        sessionId,
        parentId: entry.parentId,
        type: entry.type,
        timestamp: entry.timestamp,
        data: entry.data as unknown as Record<string, unknown>,
        tokenUsage: isMessageEntry(entry) ? entry.tokenUsage : undefined,
      })),
    );
    agentStore.getState().setEntryStatus(sessionId, entryIds, EntryStatus.Synced);
    window.dispatchEvent(
      new CustomEvent("traceability:agent-session-updated", { detail: { sessionId } }),
    );
  } catch (error) {
    console.error("Failed to persist agent entries", error);
    agentStore.getState().setEntryStatus(sessionId, entryIds, EntryStatus.Failed);
  }
}

/** Maps AgentPool stream events to durable per-session renderer state. */
export function useAgentMessages(): void {
  const { invoke } = useElectronIPC();
  const turnContentStartIndicesRef = useRef<Record<string, number>>({});
  const persistedRunRef = useRef<Record<string, boolean>>({});

  useSubscribeAgentEvents(
    {
      agent_start: (event) => {
        persistedRunRef.current[event.sessionId] = false;
        agentStore.getState().setSessionStatus(event.sessionId, "running");
      },

      agent_end: async (event) => {
        const store = agentStore.getState();
        const state = store.getEntryState(event.sessionId);
        const missingFailureMessage = findMissingFailureMessage(state.entries, event.messages);
        if (missingFailureMessage) {
          const entryId = store.appendMessageEntry(event.sessionId, missingFailureMessage);
          store.setStreamingEntryId(event.sessionId, entryId);
          store.setStreamingEntryCompletedAt(event.sessionId, Date.now());
        }

        const status = event.messages.some(isFailedAssistantMessage) ? "failed" : "completed";
        store.setSessionStatus(event.sessionId, status);
        store.setStreamingEntryCompletedAt(event.sessionId, Date.now());
        store.setStreamingEntryId(event.sessionId, undefined);
        turnContentStartIndicesRef.current[event.sessionId] = 0;

        if (!persistedRunRef.current[event.sessionId]) {
          persistedRunRef.current[event.sessionId] = true;
          await persistUnsyncedEntries(invoke, event.sessionId);
        }
      },

      turn_start: (event) => {
        const streamingEntryId = agentStore.getState().streamingEntryIds.get(event.sessionId);
        if (!streamingEntryId) {
          turnContentStartIndicesRef.current[event.sessionId] = 0;
          return;
        }

        const entry = agentStore
          .getState()
          .getEntryState(event.sessionId)
          .entries.find((candidate) => candidate.id === streamingEntryId);
        turnContentStartIndicesRef.current[event.sessionId] =
          entry &&
          isMessageEntry(entry) &&
          isAssistantMessage(entry.data) &&
          Array.isArray(entry.data.content)
            ? entry.data.content.length
            : 0;
      },

      message_start: (event) => {
        if (isUserMessage(event.message)) {
          const store = agentStore.getState();
          store.removePendingMessageByTimestamp(event.sessionId, event.message.timestamp);
          if (event.message.kind === "steering") return;

          // A follow-up starts a new visible assistant turn. Close the previous
          // streaming entry before adding the real user message to the timeline.
          if (event.message.kind === "follow-up") {
            store.setStreamingEntryCompletedAt(event.sessionId, Date.now());
            store.setStreamingEntryId(event.sessionId, undefined);
            turnContentStartIndicesRef.current[event.sessionId] = 0;
          }
          store.appendMessageEntry(event.sessionId, event.message);
          return;
        }

        if (!isAssistantMessage(event.message)) return;
        if ((turnContentStartIndicesRef.current[event.sessionId] ?? 0) !== 0) return;
        const entryId = agentStore.getState().appendMessageEntry(event.sessionId, event.message);
        agentStore.getState().setStreamingEntryId(event.sessionId, entryId);
      },

      message_update: (event) => {
        if (!isAssistantMessage(event.message)) return;
        updateStreamingAssistant(
          event.sessionId,
          event.message,
          turnContentStartIndicesRef.current[event.sessionId] ?? 0,
        );
      },

      message_end: (event) => {
        if (!isAssistantMessage(event.message)) return;
        updateStreamingAssistant(
          event.sessionId,
          event.message,
          turnContentStartIndicesRef.current[event.sessionId] ?? 0,
        );
      },

      ask_user_question_requested: (event) => {
        const { scope: _scope, sessionId, type: _type, ...question } = event;
        agentStore
          .getState()
          .enqueueHumanInTheLoopRequest(sessionId, question as AskUserQuestionRequest);
      },

      tool_execution_start: (event) => {
        const { sessionId, toolCallId, toolName, args } = event;
        const existing = agentStore.getState().getEntryState(sessionId).toolStates.get(toolCallId);
        if (existing) return;
        agentStore.getState().setToolState(sessionId, toolCallId, {
          toolCallId,
          toolName,
          status: "running",
          args,
          output: "",
        });
      },

      tool_execution_update: (event) => {
        const { sessionId, toolCallId, toolName, args } = event;
        const existing = agentStore.getState().getEntryState(sessionId).toolStates.get(toolCallId);
        if (!existing) return;
        const details = event.partialResult?.details ?? existing.details;
        agentStore.getState().setToolState(sessionId, toolCallId, {
          toolCallId,
          toolName,
          status: "running",
          args,
          details,
          output: existing.output,
        });
      },

      tool_execution_end: (event) => {
        const { sessionId, toolCallId, toolName, result, isError } = event;
        const resultContent = result?.content;
        const output = Array.isArray(resultContent) ? extractToolResultText(resultContent) : "";
        const existing = agentStore.getState().getEntryState(sessionId).toolStates.get(toolCallId);
        agentStore.getState().setToolState(sessionId, toolCallId, {
          toolCallId,
          toolName,
          status: isError ? "error" : "done",
          args: existing?.args ?? {},
          details: result?.details ?? existing?.details,
          output,
        });
      },
    },
    { shouldHandleEvent: (event) => event.scope === "main" },
  );
}

function extractToolResultText(content: { type?: string; text?: string }[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
