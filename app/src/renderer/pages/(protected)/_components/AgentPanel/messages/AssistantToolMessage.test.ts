import type { ToolExecutionState } from "@renderer/store/agent";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@extensions/core/renderer", () => ({
  useAssistantBlock: () => undefined,
}));

import { AssistantToolMessage } from "./AssistantToolMessage";

describe("AssistantToolMessage", () => {
  it("renders the Divisor-style tool status, input, and output card", () => {
    const toolState: ToolExecutionState = {
      args: { projectId: "project-1" },
      output: "1 project found",
      status: "done",
      toolCallId: "tool-1",
      toolName: "list_projects",
    };

    const markup = renderToStaticMarkup(
      createElement(AssistantToolMessage, {
        args: toolState.args,
        defaultOpen: true,
        sessionId: "session-1",
        toolName: toolState.toolName,
        toolState,
      }),
    );

    expect(markup).toContain("TOOL");
    expect(markup).toContain("已处理 list_projects");
    expect(markup).toContain("Input");
    expect(markup).toContain("projectId");
    expect(markup).toContain("1 project found");
  });
});
