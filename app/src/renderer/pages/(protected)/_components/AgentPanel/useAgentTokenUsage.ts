import type { Usage } from "@earendil-works/pi-ai";
import { agentStore, type MessageEntry } from "@renderer/store/agent";
import type { TokenUsage } from "@renderer/store/agent";

import { isAssistantMessage, isMessageEntry } from "./messages/types";
import { useSubscribeAgentEvents } from "./useSubscribeAgentEvents";

function addUsage(left: Usage, right: Usage): Usage {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    totalTokens: left.totalTokens + right.totalTokens,
    cost: {
      input: left.cost.input + right.cost.input,
      output: left.cost.output + right.cost.output,
      cacheRead: left.cost.cacheRead + right.cost.cacheRead,
      cacheWrite: left.cost.cacheWrite + right.cost.cacheWrite,
      total: left.cost.total + right.cost.total,
    },
  };
}

/** Accumulates individual model calls into the persisted assistant turn. */
export function calculateEntryTokenUsage(
  existing: MessageEntry["tokenUsage"],
  latestCall: Usage,
): TokenUsage {
  return {
    turn: existing ? addUsage(existing.turn, latestCall) : latestCall,
    latestCall,
  };
}

/** Stores token usage independently of streaming message rendering. */
export function useAgentTokenUsage(): void {
  useSubscribeAgentEvents(
    {
      message_end: (event) => {
        if (!isAssistantMessage(event.message)) return;

        const store = agentStore.getState();
        const streamingEntryId = store.streamingEntryIds.get(event.sessionId);
        if (!streamingEntryId) return;

        const entry = store
          .getEntryState(event.sessionId)
          .entries.find((candidate) => candidate.id === streamingEntryId);
        if (!entry || !isMessageEntry(entry) || !isAssistantMessage(entry.data)) return;

        store.setMessageEntryTokenUsage(
          event.sessionId,
          streamingEntryId,
          calculateEntryTokenUsage(entry.tokenUsage, event.message.usage),
        );
      },
    },
    { shouldHandleEvent: (event) => event.scope === "main" },
  );
}
