import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineAssistantBlock } from "../../shared/assistant-block.js";
import {
  buildGenerativeUiSystemPrompt,
  createRenderUiTool,
  shouldAddRenderUiTool,
} from "./generative-ui.js";

describe("generative UI runtime", () => {
  it("returns the original props as a terminal assistant block", async () => {
    const tool = createRenderUiTool();
    const props = { projectId: "not-yet-validated", nested: [1, 2] };

    const result = await tool.execute("tool-call", { type: "issues.list", props });

    expect(result.terminate).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: 'Rendered UI component "issues.list".' },
    ]);
    expect(result.details).toEqual({
      type: "generative-ui.render",
      assistantBlock: { type: "issues.list", props },
    });
  });

  it("describes registered component schemas in the model prompt", () => {
    const definition = defineAssistantBlock({
      type: "issues.list",
      description: "Display issues",
      propsSchema: z.object({ limit: z.number().int().default(20) }),
    });

    const prompt = buildGenerativeUiSystemPrompt([definition]);

    expect(prompt).toContain("call render_ui alone as the final action");
    expect(prompt).toContain("issues.list: Display issues");
    expect(prompt).toContain('"limit"');
    expect(prompt).toContain("Do not emit an agent-block code fence");
  });

  it("adds render_ui unless the runtime excludes it", () => {
    const definition = defineAssistantBlock({
      type: "projects.list",
      description: "Display projects",
      propsSchema: z.object({}),
    });

    expect(shouldAddRenderUiTool([], [definition], new Set())).toBe(true);
    expect(shouldAddRenderUiTool([], [definition], new Set(["render_ui"]))).toBe(false);
    expect(shouldAddRenderUiTool([], [], new Set())).toBe(false);
    expect(shouldAddRenderUiTool(["render_ui"], [definition], new Set())).toBe(false);
  });
});
