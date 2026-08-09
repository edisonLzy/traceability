import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@renderer/store/agent";
import { EntryStatus } from "@renderer/store/agent";
import { describe, expect, it } from "vitest";

import { deriveFloatingAgentSummary } from "./floating-agent-summary";

function messageEntry(id: string, data: AgentMessage): SessionEntry {
  return {
    id,
    sessionId: "session-a",
    parentId: null,
    type: "message",
    timestamp: 1,
    data,
    status: EntryStatus.Local,
  };
}

describe("floating Agent summary", () => {
  it("prefers the active streaming assistant output and removes markdown noise", () => {
    const entries = [
      messageEntry("old", {
        role: "assistant",
        content: [{ type: "text", text: "Older result" }],
      } as AgentMessage),
      messageEntry("streaming", {
        role: "assistant",
        content: [{ type: "text", text: "**Checking** the [cache path](https://example.com)…" }],
      } as AgentMessage),
    ];

    expect(deriveFloatingAgentSummary(entries, "running", "streaming")).toBe(
      "Checking the cache path…",
    );
  });

  it("falls back to the latest assistant thinking while a run has no text yet", () => {
    const entries = [
      messageEntry("assistant", {
        role: "assistant",
        content: [{ type: "thinking", thinking: "Comparing the response shape" }],
      } as AgentMessage),
    ];

    expect(deriveFloatingAgentSummary(entries, "running", "assistant")).toBe(
      "Comparing the response shape",
    );
  });

  it("keeps the latest streaming text visible when the output exceeds the summary limit", () => {
    const entries = [
      messageEntry("streaming", {
        role: "assistant",
        content: [
          {
            type: "text",
            text: `${"Earlier investigation. ".repeat(20)}Now checking the failing request.`,
          },
        ],
      } as AgentMessage),
    ];

    const summary = deriveFloatingAgentSummary(entries, "running", "streaming");

    expect(summary?.startsWith("…")).toBe(true);
    expect(summary?.endsWith("Now checking the failing request.")).toBe(true);
  });

  it("hides the summary when there is no live output or the run is complete", () => {
    const userOnly = [
      messageEntry("user", {
        role: "user",
        content: "Investigate this issue",
        timestamp: 1,
        kind: "prompt",
        jsonContent: { type: "doc" },
      } as AgentMessage),
    ];

    expect(deriveFloatingAgentSummary(userOnly, "running")).toBeNull();
    expect(deriveFloatingAgentSummary([], "completed")).toBeNull();
  });
});
