import type { SessionEntry, SessionStatus } from "@renderer/store/agent";

const MAX_SUMMARY_LENGTH = 240;

function normalizeSummary(value: string): string {
  const normalized = value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-+*]\s+|>\s?)/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= MAX_SUMMARY_LENGTH) return normalized;
  return `…${normalized.slice(-(MAX_SUMMARY_LENGTH - 1)).trimStart()}`;
}

function getAssistantOutput(entry: SessionEntry): string {
  if (entry.type !== "message" || entry.data.role !== "assistant") return "";
  if (!Array.isArray(entry.data.content)) return "";

  const text: string[] = [];
  const thinking: string[] = [];

  for (const block of entry.data.content) {
    if (block.type === "text" && block.text.trim()) text.push(block.text);
    if (block.type === "thinking" && block.thinking.trim()) thinking.push(block.thinking);
  }

  return normalizeSummary(text.join("\n") || thinking.at(-1) || "");
}

/** Derives a short, presentation-only view of the active Agent store state. */
export function deriveFloatingAgentSummary(
  entries: SessionEntry[],
  status: SessionStatus,
  streamingEntryId?: string,
): string | null {
  if (status !== "running") return null;

  if (streamingEntryId) {
    const streamingEntry = entries.find((entry) => entry.id === streamingEntryId);
    if (streamingEntry) {
      const streamingOutput = getAssistantOutput(streamingEntry);
      if (streamingOutput) return streamingOutput;
    }
  }

  for (const entry of [...entries].reverse()) {
    const output = getAssistantOutput(entry);
    if (output) return output;
  }

  return null;
}
