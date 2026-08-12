import type { AssistantMessage as AssistantMessageType } from "@earendil-works/pi-ai";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssistantMessage } from "./AssistantMessage";

describe("AssistantMessage", () => {
  it("contains long unbroken error responses inside the message column", () => {
    const message = {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage: `404 <!DOCTYPE html>${"unbroken".repeat(700)}</html>`,
    } as unknown as AssistantMessageType;

    const markup = renderToStaticMarkup(
      createElement(AssistantMessage, {
        completedAt: 1,
        isStreaming: false,
        message,
        sessionId: "session-1",
        startedAt: 1,
        toolStates: new Map(),
      }),
    );

    expect(markup).toContain("min-w-0 max-w-full overflow-hidden");
    expect(markup).toContain("whitespace-pre-wrap");
    expect(markup).toContain("[overflow-wrap:anywhere]");
    expect(markup).toContain("&lt;!DOCTYPE html&gt;");
  });
});
