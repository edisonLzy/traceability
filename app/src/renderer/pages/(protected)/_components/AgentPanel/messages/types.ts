import type { AgentMessage, AppUserMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { EntryStatus, type Entry, type SessionEntry } from "@renderer/store/agent";
import type { AvailableModel } from "@shared/models-ipc";

export function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant";
}

export function isUserMessage(message: AgentMessage): message is AppUserMessage {
  return message.role === "user";
}

export function isFailedAssistantMessage(message: unknown): message is AssistantMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<AssistantMessage>;
  return (
    candidate.role === "assistant" &&
    (candidate.stopReason === "error" ||
      candidate.stopReason === "aborted" ||
      Boolean(candidate.errorMessage))
  );
}

export function isMessageEntry(
  entry: SessionEntry,
): entry is Extract<SessionEntry, { type: "message" }> {
  return entry.type === "message";
}

export function toSessionEntry(entry: Entry): SessionEntry {
  if (entry.type === "message") {
    return {
      ...entry,
      type: "message",
      data: entry.data as unknown as AgentMessage,
      tokenUsage: entry.tokenUsage ?? null,
      status: EntryStatus.Synced,
    };
  }

  return {
    ...entry,
    type: "model_change",
    data: entry.data,
    status: EntryStatus.Synced,
  };
}

export function getSelectedModel(entries: SessionEntry[]): AvailableModel | null {
  for (const entry of [...entries].reverse()) {
    if (!isMessageEntry(entry) || !isUserMessage(entry.data)) continue;
    const model = entry.data.metadata?.model;
    if (!model) continue;
    return {
      providerId: model.providerId,
      modelId: model.modelId,
      providerName: model.providerId,
      modelName: model.modelId,
    };
  }

  return null;
}

export function assistantText(message: AssistantMessage): string {
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter(
      (block): block is Extract<(typeof message.content)[number], { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("\n");
}

export function assistantThinking(message: AssistantMessage): string[] {
  if (!Array.isArray(message.content)) return [];
  return message.content
    .filter(
      (block): block is Extract<(typeof message.content)[number], { type: "thinking" }> =>
        block.type === "thinking",
    )
    .map((block) => block.thinking);
}
