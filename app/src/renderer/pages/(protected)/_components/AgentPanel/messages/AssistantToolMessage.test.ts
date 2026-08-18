import type { ToolExecutionState } from "@renderer/store/agent";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@extensions/core/renderer", () => ({
  useAssistantBlock: () => undefined,
}));

import { AssistantToolMessage } from "./AssistantToolMessage";

describe("AssistantToolMessage", () => {
  it("renders a Codex-style shell call with its command and output", () => {
    const toolState: ToolExecutionState = {
      args: { command: "pwd && rg --files -g '!node_modules'", cwd: "/workspace" },
      output: "src/main/index.ts",
      status: "done",
      toolCallId: "tool-1",
      toolName: "terminal_create",
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

    expect(markup).toContain("已运行命令");
    expect(markup).toContain("Shell");
    expect(markup).toContain("$ ");
    expect(markup).toContain("pwd &amp;&amp; rg --files -g &#x27;!node_modules&#x27;");
    expect(markup).toContain("src/main/index.ts");
    expect(markup).toContain("rotate-0");
    expect(markup).not.toContain("TOOL");
    expect(markup).not.toContain("Input");
  });

  it("rotates the chevron toward the collapsed direction when closed", () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantToolMessage, {
        args: { command: "pwd" },
        sessionId: "session-1",
        toolName: "terminal_create",
        toolState: {
          args: { command: "pwd" },
          output: "/workspace",
          status: "done",
          toolCallId: "tool-1",
          toolName: "terminal_create",
        },
      }),
    );

    expect(markup).toContain("-rotate-90");
  });
});
