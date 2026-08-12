import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import { convertAgentMessagesToLlmMessages } from "./agent-messages.js";

describe("convertAgentMessagesToLlmMessages", () => {
  it("filters durable UI-only messages from the LLM context", () => {
    const messages = [
      { role: "user", content: "Show issues", timestamp: 1 },
      {
        role: "assistantBlock",
        block: { type: "issues.list", props: { limit: 20 } },
        timestamp: 2,
        toolCallId: "render-1",
        toolName: "render_ui",
      },
    ] as AgentMessage[];

    expect(convertAgentMessagesToLlmMessages(messages)).toEqual([
      { role: "user", content: "Show issues", timestamp: 1 },
    ]);
  });
});
